import { describe, expect, it } from 'vitest'

import { buildFtsMatchQuery } from './fts-query-parser'

describe('buildFtsMatchQuery', () => {
  it('returns null for an empty string', () => {
    expect(buildFtsMatchQuery('')).toEqual(null)
  })

  it('returns null for whitespace-only input', () => {
    expect(buildFtsMatchQuery('   \t\n  ')).toEqual(null)
  })

  it('quotes a single word and appends a prefix wildcard', () => {
    expect(buildFtsMatchQuery('dune')).toEqual('"dune"*')
  })

  it('quotes multiple words and joins them with whitespace', () => {
    expect(buildFtsMatchQuery('dune part two')).toEqual(
      '"dune"* "part"* "two"*'
    )
  })

  it('collapses runs of whitespace between words', () => {
    expect(buildFtsMatchQuery('  dune    part  ')).toEqual('"dune"* "part"*')
  })

  it('strips embedded double quotes from each word', () => {
    expect(buildFtsMatchQuery('foo"bar')).toEqual('"foobar"*')
  })

  it('treats FTS operators as literal tokens, not as syntax', () => {
    expect(buildFtsMatchQuery('foo OR bar')).toEqual('"foo"* "OR"* "bar"*')
  })

  it('strips lone double-quote characters', () => {
    expect(buildFtsMatchQuery('"')).toEqual(null)
  })

  it('strips FTS5 special characters from words', () => {
    // Asterisks, parens, colons, NEAR operator characters etc. are stripped
    // so user input cannot smuggle FTS syntax into the MATCH expression.
    expect(buildFtsMatchQuery('foo* (bar) baz:qux')).toEqual(
      '"foo"* "bar"* "bazqux"*'
    )
  })

  it('returns null when input is only special characters', () => {
    expect(buildFtsMatchQuery('* () : "" ')).toEqual(null)
  })

  it('handles words mixing letters, numbers, and accented characters', () => {
    expect(buildFtsMatchQuery('blade runner 2049 amélie')).toEqual(
      '"blade"* "runner"* "2049"* "amélie"*'
    )
  })

  it('handles single-character tokens', () => {
    expect(buildFtsMatchQuery('it')).toEqual('"it"*')
  })
})
