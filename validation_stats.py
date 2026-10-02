"""Statistics for D6 validation, computed with formulas rather than by an AI.

- required_sample_size: how many parts must pass a test before a defect rate below a target can be claimed.
- compare_rates: whether the defect rate after a corrective action is lower than before, beyond chance.

Only the standard library is used. All rates are fractions (0.003 = 3,000 PPM).
"""
from math import ceil, comb, exp, lgamma, log

MAX_SAMPLE = 10_000_000


def _log_comb(n: int, k: int) -> float:
    return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1)


def binom_cdf(k: int, n: int, p: float) -> float:
    """P(X <= k) for X ~ Binomial(n, p)."""
    if p <= 0:
        return 1.0
    if p >= 1:
        return 1.0 if k >= n else 0.0
    lp, lq = log(p), log(1 - p)
    return min(1.0, sum(exp(_log_comb(n, i) + i * lp + (n - i) * lq) for i in range(0, min(k, n) + 1)))


def required_sample_size(target_rate: float, confidence: float, allowed_failures: int = 0) -> int:
    """Smallest n such that seeing at most `allowed_failures` failures in n parts shows, at `confidence`,
    that the true rate is below `target_rate`."""
    if not 0 < target_rate < 1 or not 0 < confidence < 1 or allowed_failures < 0:
        raise ValueError("목표 불량률은 0~1, 신뢰도는 0~1 사이, 허용 불량 수는 0 이상이어야 합니다.")
    if allowed_failures == 0:
        return int(ceil(log(1 - confidence) / log(1 - target_rate)))
    # Search upward from the zero-failure size; the binomial tail falls as n grows.
    n = int(ceil(log(1 - confidence) / log(1 - target_rate)))
    step = max(1, n // 4)
    while binom_cdf(allowed_failures, n, target_rate) > 1 - confidence:
        n += step
        if n > MAX_SAMPLE:
            raise ValueError("필요 시료 수가 너무 큽니다. 목표 불량률이나 신뢰도를 조정하세요.")
    low = max(allowed_failures + 1, n - step)
    while low < n:  # binary search for the smallest passing n
        mid = (low + n) // 2
        if binom_cdf(allowed_failures, mid, target_rate) <= 1 - confidence:
            n = mid
        else:
            low = mid + 1
    return n


def upper_bound(failures: int, n: int, confidence: float) -> float:
    """One-sided upper confidence bound of a defect rate (Clopper-Pearson)."""
    if n <= 0 or not 0 <= failures <= n:
        raise ValueError("시료 수와 불량 수를 확인하세요.")
    if failures == n:
        return 1.0
    low, high = failures / n, 1.0
    for _ in range(80):
        mid = (low + high) / 2
        if binom_cdf(failures, n, mid) > 1 - confidence:
            low = mid
        else:
            high = mid
    return high


def fisher_lower_tail(before_fail: int, before_n: int, after_fail: int, after_n: int) -> float:
    """One-sided Fisher exact p-value that the after-rate is lower than the before-rate."""
    total_fail, total = before_fail + after_fail, before_n + after_n
    denominator = comb(total, after_n)
    return min(1.0, sum(comb(total_fail, k) * comb(total - total_fail, after_n - k)
                        for k in range(max(0, after_n - (total - total_fail)), after_fail + 1)) / denominator)


def ppm(rate: float) -> int:
    return int(round(rate * 1_000_000))


def compare_rates(before_fail: int, before_n: int, after_fail: int, after_n: int, confidence: float = 0.9, target_rate: float | None = None) -> dict:
    """Judge the after-rate against a target (by default the before-rate), and report the two-sample test beside it.

    The verdict asks: is the after-rate below the target at this confidence? The before data is also uncertain
    when it holds few defects, so the Fisher test of before against after is shown as supporting information.
    """
    for value in (before_fail, before_n, after_fail, after_n):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError("수량은 0 이상의 정수여야 합니다.")
    if before_n == 0 or after_n == 0 or before_fail > before_n or after_fail > after_n:
        raise ValueError("시료 수는 1 이상이고 불량 수는 시료 수를 넘을 수 없습니다.")
    if not 0 < confidence < 1:
        raise ValueError("신뢰도는 0~1 사이여야 합니다.")
    before_rate, after_rate = before_fail / before_n, after_fail / after_n
    target = before_rate if target_rate is None else target_rate
    if not 0 < target < 1:
        raise ValueError("비교 기준 불량률이 0입니다. 적용 전 불량이 0건이면 목표 불량률을 직접 입력하세요.")
    after_upper = upper_bound(after_fail, after_n, confidence)
    p_value = fisher_lower_tail(before_fail, before_n, after_fail, after_n)
    alpha = 1 - confidence
    if after_rate >= target:
        verdict, label = "not_improved", "개선되지 않음"
        reason = f"적용 후 불량률({ppm(after_rate):,} PPM)이 기준({ppm(target):,} PPM)보다 낮지 않습니다."
    elif after_upper < target:
        verdict, label = "improved", "개선 확인"
        reason = f"적용 후 불량률의 상한({ppm(after_upper):,} PPM, 신뢰도 {confidence:.0%})이 기준({ppm(target):,} PPM)보다 낮습니다."
    else:
        verdict, label = "inconclusive", "판단 불가 — 시료 부족"
        reason = f"적용 후 불량률은 낮지만 상한({ppm(after_upper):,} PPM)이 기준({ppm(target):,} PPM)을 넘어, 이 시료 수로는 개선을 말할 수 없습니다."
    try:
        needed = required_sample_size(target, confidence, after_fail)
    except ValueError:
        needed = None
    if after_rate >= before_rate:
        two_sample = "적용 후 불량률이 적용 전 자료보다 낮지 않습니다."
    else:
        two_sample = (f"적용 전·후 자료끼리 비교한 유의확률은 {p_value:.3f}입니다. "
                      + ("두 자료의 차이도 우연이 아니라고 볼 수 있습니다." if p_value <= alpha else
                         "적용 전 자료의 불량 건수가 적어, 두 자료만 비교하면 우연일 가능성이 남습니다."))
    return {"before": {"fail": before_fail, "n": before_n, "rate": before_rate, "ppm": ppm(before_rate)},
            "after": {"fail": after_fail, "n": after_n, "rate": after_rate, "ppm": ppm(after_rate), "upperBound": after_upper, "upperBoundPpm": ppm(after_upper)},
            "target": {"rate": target, "ppm": ppm(target), "source": "before" if target_rate is None else "input"},
            "confidence": confidence, "verdict": verdict, "verdictLabel": label, "reason": reason,
            "pValue": p_value, "twoSample": two_sample, "sampleNeededForClaim": needed}


def sample_size_plan(target_rate: float, confidence: float, allowed_failures: int = 0) -> dict:
    n = required_sample_size(target_rate, confidence, allowed_failures)
    return {"targetRate": target_rate, "targetPpm": ppm(target_rate), "confidence": confidence, "allowedFailures": allowed_failures, "sampleSize": n,
            "statement": f"불량 {allowed_failures}개 이하로 {n:,}개를 통과하면, 불량률이 {ppm(target_rate):,} PPM보다 낮다고 신뢰도 {confidence:.0%}로 말할 수 있습니다."}
