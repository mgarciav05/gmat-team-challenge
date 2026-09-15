/**
 * Team formation algorithm — GMAT Team Challenge
 * ------------------------------------------------
 * Partitions N participants into groups targeting size 3, following this
 * exact priority (as specified by the facilitator):
 *   1. Prefer groups of 3.
 *   2. If N is not a multiple of 3, prefer ONE group of 4 over multiple
 *      groups of 2 (remainder 1 case).
 *   3. Allow at most ONE group of 2 if unavoidable (remainder 2 case).
 *   4. NEVER produce a group of 1.
 *
 * Math (r = N mod 3):
 *   r === 0  ->  N/3 groups of 3
 *   r === 1  ->  (N-4)/3 groups of 3  +  1 group of 4      (needs N >= 4)
 *   r === 2  ->  (N-2)/3 groups of 3  +  1 group of 2
 *
 * Verified against the facilitator's worked examples:
 *   9 -> 3x3 | 10 -> 2x3+1x4 | 11 -> 3x3+1x2 | 12 -> 4x3
 *   13 -> 3x3+1x4 | 14 -> 4x3+1x2 | 15 -> 5x3
 *
 * Degenerate case N===1: cannot form any valid team (a team of 1 is
 * explicitly disallowed). The function returns a single group containing
 * that one participant but flags `degenerate: true` so the UI can tell the
 * host to wait for more participants instead of silently proceeding.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TeamFormation = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function shuffled(arr, rng) {
    var a = arr.slice();
    var random = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /**
   * @param {Array} participants - array of participant objects (any shape).
   *   Only used opaquely; the function does not read/write their fields.
   * @param {Object} [opts]
   * @param {Function} [opts.rng] - optional RNG (0..1) for deterministic tests.
   * @returns {{groups: Array<Array>, sizes: number[], degenerate: boolean}}
   */
  function planGroupSizes(n) {
    if (n <= 0) return { sizes: [], degenerate: false };
    if (n === 1) return { sizes: [1], degenerate: true };
    if (n === 2) return { sizes: [2], degenerate: false };

    var r = n % 3;
    var sizes = [];
    if (r === 0) {
      var count3 = n / 3;
      for (var i = 0; i < count3; i++) sizes.push(3);
    } else if (r === 1) {
      // (n-4)/3 groups of 3 + one group of 4
      var count3b = (n - 4) / 3;
      for (var j = 0; j < count3b; j++) sizes.push(3);
      sizes.push(4);
    } else {
      // r === 2: (n-2)/3 groups of 3 + one group of 2
      var count3c = (n - 2) / 3;
      for (var k = 0; k < count3c; k++) sizes.push(3);
      sizes.push(2);
    }
    return { sizes: sizes, degenerate: false };
  }

  function formTeams(participants, opts) {
    opts = opts || {};
    var n = participants.length;
    var plan = planGroupSizes(n);
    var pool = shuffled(participants, opts.rng);
    var groups = [];
    var idx = 0;
    for (var g = 0; g < plan.sizes.length; g++) {
      var size = plan.sizes[g];
      groups.push(pool.slice(idx, idx + size));
      idx += size;
    }
    return {
      groups: groups,
      sizes: plan.sizes,
      degenerate: plan.degenerate,
    };
  }

  return { formTeams: formTeams, planGroupSizes: planGroupSizes, _shuffled: shuffled };
});
