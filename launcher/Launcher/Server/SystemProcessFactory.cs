using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Jukebox.Launcher.Server;

public sealed class SystemProcessFactory : IProcessFactory
{
    public string? GetExecutablePath(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);

            return process.MainModule?.FileName;
        }
        catch (Exception error)
            when (error is ArgumentException or InvalidOperationException or Win32Exception)
        {
            return null;
        }
    }

    public void KillById(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);

            process.Kill(entireProcessTree: true);
            process.WaitForExit(5000);
        }
        catch (Exception error)
            when (error is ArgumentException or InvalidOperationException
                or NotSupportedException or Win32Exception)
        {
        }
    }

    public IManagedProcess Start(ServerProcessStartInfo startInfo)
    {
        var process = new Process
        {
            EnableRaisingEvents = true,
            StartInfo = new ProcessStartInfo
            {
                Arguments = startInfo.Arguments,
                CreateNoWindow = true,
                FileName = startInfo.ExecutablePath,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                WorkingDirectory = startInfo.WorkingDirectory,
            },
        };

        StreamWriter logWriter;

        try
        {
            var logStream = new FileStream(
                startInfo.LogFilePath,
                FileMode.Append,
                FileAccess.Write,
                FileShare.Read);
            logWriter = new StreamWriter(logStream) { AutoFlush = true };
        }
        catch
        {
            process.Dispose();
            throw;
        }

        var logLock = new object();

        process.OutputDataReceived += (_, eventArguments) =>
            AppendLine(logWriter, logLock, eventArguments.Data);
        process.ErrorDataReceived += (_, eventArguments) =>
            AppendLine(logWriter, logLock, eventArguments.Data);

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException(
                    $"Process did not start: {startInfo.ExecutablePath}.");
            }
        }
        catch
        {
            logWriter.Dispose();
            process.Dispose();
            throw;
        }

        process.BeginErrorReadLine();
        process.BeginOutputReadLine();

        return new SystemManagedProcess(process, logWriter, logLock);
    }

    private static void AppendLine(StreamWriter logWriter, object logLock, string? line)
    {
        if (line is null)
        {
            return;
        }

        lock (logLock)
        {
            try
            {
                logWriter.WriteLine(line);
            }
            catch (Exception error) when (error is IOException or ObjectDisposedException)
            {
            }
        }
    }

    private sealed class SystemManagedProcess : IManagedProcess
    {
        private readonly object logLock;
        private readonly StreamWriter logWriter;
        private readonly Process process;

        public SystemManagedProcess(Process process, StreamWriter logWriter, object logLock)
        {
            this.process = process;
            this.logWriter = logWriter;
            this.logLock = logLock;
        }

        public int Id => process.Id;

        public void Dispose()
        {
            process.Dispose();

            lock (logLock)
            {
                logWriter.Dispose();
            }
        }

        public void Kill()
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (Exception error)
                when (error is InvalidOperationException or NotSupportedException
                    or Win32Exception)
            {
            }
        }

        public bool TrySignalTerminate()
        {
            if (OperatingSystem.IsWindows())
            {
                return false;
            }

            try
            {
                using var kill = Process.Start(new ProcessStartInfo
                {
                    ArgumentList = { "-TERM", process.Id.ToString() },
                    CreateNoWindow = true,
                    FileName = "/bin/kill",
                    UseShellExecute = false,
                });

                if (kill is null)
                {
                    return false;
                }

                kill.WaitForExit(2000);

                return kill.ExitCode == 0;
            }
            catch (Exception error)
                when (error is InvalidOperationException or Win32Exception)
            {
                return false;
            }
        }

        public async Task<int> WaitForExitAsync(CancellationToken cancellationToken)
        {
            await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);

            // Process.WaitForExitAsync does not guarantee that redirected output has
            // finished being processed, unlike the parameterless synchronous
            // WaitForExit() overload. The process has already exited at this point, so
            // this call returns immediately, but it guarantees the OutputDataReceived
            // and ErrorDataReceived handlers have drained before we return, making it
            // safe to dispose the log writer afterward.
            process.WaitForExit();

            return process.ExitCode;
        }
    }
}
