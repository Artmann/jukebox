- Use Bun as the package manager.
- Always use migrations for the database.
- Use dayjs for dates and time.
- Use ffmpeg for media probing and transcoding.
- Use invariant from tiny-invariant for sanity checks and to throw errors when
  assumptions are violated.

## Error handling

- Always handle errors.
- User facing errors should be easy to understand and actionable.
- Error messages must be actionable — tell the user what went wrong and what
  they can do about it.
- When planning features, always consider what errors can occur and include the
  exact error messages in the plan.

## Testing

- Don't mock the database. Use a test database or in-memory SQLite instance
  instead.
- Put test files next to the implementation.
- Prefer `toEqual` over `toBe`
- Compare entire objects instead of single properties.
  `expect(product).toEqual({ id: 1, name: 'Cup' })`

## Code Style

- Always use bracers for control flows, even if they are one-liners.
- Don't use CONSTANT_CASE. This is not JAVA.
- Use entire words as variable names. This is not Go. For example `request`
  instead of `req`.
- Use punctuation.
- Use whitespace to break up code to make it easier to read. Put a blank like
  after const groups and control flows and before return statements.
- Order things in alphabetical order by default. If applicable order by
  accessiblity level first, then alphabetical order.
- No any: Use proper types or unknown
- No Non-null Assertions: Avoid ! operator
- Prefer Nullish Coalescing: Use ?? over ||
- No Floating Promises: Always await or handle promises
- Single quotes
- No semicolons

## Prefered Tools

- Bun
- Tailwind CSS
- shadcn/ui
- Lucide icons
- React hook form
- tiny-invariant
- tiny-typescript-logger
- Zod
- dayjs
- ffmpeg
- Radash
- SQLite
