# 山羊：删掉木盆（高度 0.3 以内、右下角的那个连通块），只留羊身
def _goat_keep(mn, mx, n):
    return not (mx[2] < 0.35 and mn[0] > 0.1)
FILTERS['cartoon_goat'] = _goat_keep
