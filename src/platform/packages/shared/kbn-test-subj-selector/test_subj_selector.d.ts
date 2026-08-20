/**
 * Converts a testSubject selector into a CSS selector.
 *
 * testSubject selector syntax rules:
 *
 *   - `data-test-subj` values can include spaces
 *
 *   - prefixing a value with `*` will allow matching a `data-test-subj` attribute containing at least one occurrence of value within the string.
 *     - example: `*foo`
 *     - css equivalent: `[data-test-subj*="foo"]`
 *     - DOM match example: <div data-test-subj="bar-foo"> </div>
 *
 *   - prefixing a value with `^` will allow matching a `data-test-subj` attribute beginning with the specified value.
 *     - example: `^foo`
 *     - css equivalent: `[data-test-subj^="foo"]`
 *     - DOM match example: <div data-test-subj="foo_bar"> </div>
 *
 *   - prefixing a value with `~` will allow matching a `data-test-subj` attribute represented as a whitespace-separated list of words, one of which is exactly value
 *     - example: `~foo`
 *     - css equivalent: `[data-test-subj~="foo"]`
 *     - DOM match example: <div data-test-subj="foo bar"> </div>
 *
 *   - the `>` character is used between two values to indicate that the value on the right must match an element inside an element matched by the value on the left
 *     - example: `foo > bar`
 *     - css equivalent: `[data-test-subj=foo] [data-test-subj=bar]`
 *     - DOM match example:
 *       <div data-test-subj="foo">
 *          <div data-test-subj="bar"> </div>
 *      </div>
 *
 *   - the `&` character is used between two values to indicate that the value on both sides must both match the element
 *     - example: `foo & bar`
 *     - css equivalent: `[data-test-subj=foo][data-test-subj=bar]`
 *      - DOM match example: <div data-test-subj="foo bar"> </div>
 */
export declare function subj(selector: string): string;
