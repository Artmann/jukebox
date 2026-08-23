import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VideoTrackBar } from './VideoTrackBar'

const trackWidth = 200
const trackLeft = 0

beforeEach(() => {
  // jsdom lays nothing out, so the bar would measure 0 wide and every position
  // would come out as NaN.
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 4,
    height: 4,
    left: trackLeft,
    right: trackLeft + trackWidth,
    toJSON: () => ({}),
    top: 0,
    width: trackWidth,
    x: trackLeft,
    y: 0
  })

  HTMLDivElement.prototype.setPointerCapture = vi.fn()
  HTMLDivElement.prototype.releasePointerCapture = vi.fn()
  HTMLDivElement.prototype.hasPointerCapture = vi.fn(() => true)
})

function renderTrackBar(onSeek: (position: number) => void) {
  render(
    <VideoTrackBar
      buffered={0.2}
      onSeek={onSeek}
      progress={0.1}
      reachable={0.4}
    />
  )

  return screen.getByTestId('video-track-bar')
}

// Seeking on every pointermove used to be harmless, because a seek was just a
// property assignment. Now a seek past the transcode head restarts the whole
// conversion, so a drag across the bar would start one conversion per mouse
// pixel and thrash the server.
describe('VideoTrackBar', () => {
  it('seeks once on release, not on every pointer move', () => {
    const onSeek = vi.fn()
    const track = renderTrackBar(onSeek)

    fireEvent.pointerDown(track, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 60, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 120, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 })

    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 })

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(0.75)
  })

  it('previews the dragged position while the pointer is down', () => {
    const onSeek = vi.fn()
    const track = renderTrackBar(onSeek)

    fireEvent.pointerDown(track, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 })

    expect(screen.getByTestId('video-track-bar-progress').style.width).toEqual(
      '75%'
    )
  })

  it('seeks once for a plain click', () => {
    const onSeek = vi.fn()
    const track = renderTrackBar(onSeek)

    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 100, pointerId: 1 })

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(0.5)
  })

  it('does not seek when the pointer is cancelled mid-drag', () => {
    const onSeek = vi.fn()
    const track = renderTrackBar(onSeek)

    fireEvent.pointerDown(track, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 })
    fireEvent.pointerCancel(track, { clientX: 150, pointerId: 1 })

    expect(onSeek).not.toHaveBeenCalled()
    expect(screen.getByTestId('video-track-bar-progress').style.width).toEqual(
      '10%'
    )
  })

  it('renders the reachable band separately from the buffered band', () => {
    const onSeek = vi.fn()

    renderTrackBar(onSeek)

    expect(screen.getByTestId('video-track-bar-reachable').style.width).toEqual(
      '40%'
    )
    expect(screen.getByTestId('video-track-bar-buffered').style.width).toEqual(
      '20%'
    )
  })
})
