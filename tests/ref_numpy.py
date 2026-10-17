"""Implementasi acuan independen (numpy) untuk memeriksa topsis-core.js.
Menghasilkan fixtures JSON berisi kasus acak + kasus contoh supplier."""
import json, sys
import numpy as np

rng = np.random.default_rng(20261017)


def norm(X, method):
    X = np.asarray(X, float)
    if method == 'vector':
        d = np.sqrt((X ** 2).sum(0)); return np.where(d > 1e-12, X / np.where(d > 1e-12, d, 1), 0)
    if method == 'sum':
        d = X.sum(0); return np.where(np.abs(d) > 1e-12, X / np.where(np.abs(d) > 1e-12, d, 1), 0)
    if method == 'linear':
        d = np.abs(X).max(0); return np.where(d > 1e-12, X / np.where(d > 1e-12, d, 1), 0)
    if method == 'minmax':
        mn, mx = X.min(0), X.max(0); r = mx - mn
        return np.where(r > 1e-12, (X - mn) / np.where(r > 1e-12, r, 1), 0)


def topsis(X, w, types, method='vector'):
    w = np.asarray(w, float); w = w / w.sum()
    R = norm(X, method)
    V = R * w
    ben = np.array([t != 'cost' for t in types])
    Ap = np.where(ben, V.max(0), V.min(0))
    An = np.where(ben, V.min(0), V.max(0))
    Dp = np.sqrt(((V - Ap) ** 2).sum(1))
    Dn = np.sqrt(((V - An) ** 2).sum(1))
    C = np.where(Dp + Dn > 1e-12, Dn / np.where(Dp + Dn > 1e-12, Dp + Dn, 1), 0.5)
    return dict(R=R.tolist(), V=V.tolist(), Apos=Ap.tolist(), Aneg=An.tolist(), Dpos=Dp.tolist(), Dneg=Dn.tolist(), C=C.tolist())


def entropy(X):
    X = np.asarray(X, float); m = X.shape[0]
    P = X / X.sum(0)
    with np.errstate(divide='ignore', invalid='ignore'):
        L = np.where(P > 0, P * np.log(np.where(P > 0, P, 1)), 0)
    E = -L.sum(0) / np.log(m)
    D = 1 - E
    return dict(E=E.tolist(), w=(D / D.sum()).tolist())


def critic(X, types):
    X = np.asarray(X, float)
    mn, mx = X.min(0), X.max(0)
    N = np.where([t == 'cost' for t in types], (mx - X) / (mx - mn), (X - mn) / (mx - mn))
    s = N.std(0, ddof=1)
    r = np.corrcoef(N, rowvar=False)
    C = s * (1 - r).sum(1)
    return dict(sigma=s.tolist(), w=(C / C.sum()).tolist())


def ahp(A):
    A = np.asarray(A, float)
    vals, vecs = np.linalg.eig(A)
    k = np.argmax(vals.real)
    w = np.abs(vecs[:, k].real); w = w / w.sum()
    n = len(A)
    lam = vals[k].real
    RI = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49][n]
    CI = (lam - n) / (n - 1)
    return dict(w=w.tolist(), lambdaMax=lam, CR=CI / RI)


cases = []
# kasus contoh supplier dari repo asli
cases.append(dict(name='supplier', X=[[8, 7, 10], [9, 8, 12], [7, 9, 9]], w=[40, 35, 25], types=['benefit', 'benefit', 'cost']))
for t in range(25):
    m = int(rng.integers(2, 9)); n = int(rng.integers(2, 7))
    X = np.round(rng.uniform(1, 100, (m, n)), 3)
    w = np.round(rng.uniform(1, 10, n), 2)
    types = ['cost' if rng.random() < 0.4 else 'benefit' for _ in range(n)]
    cases.append(dict(name=f'acak{t}', X=X.tolist(), w=w.tolist(), types=types))

out = []
for c in cases:
    row = dict(c)
    row['res'] = {mth: topsis(c['X'], c['w'], c['types'], mth) for mth in ['vector', 'linear', 'minmax', 'sum']}
    row['entropy'] = entropy(c['X'])
    if len(c['X']) >= 3:
        row['critic'] = critic(c['X'], c['types'])
    out.append(row)

# matriks AHP konsisten & tidak konsisten
ahp_cases = []
for n in range(3, 8):
    v = rng.uniform(1, 9, n)
    A = np.outer(v, 1 / v)
    noise = np.exp(rng.normal(0, 0.35, (n, n)))
    A = A * np.triu(noise, 1) + A * np.tril(1 / noise.T, -1) + np.eye(n) * 0
    np.fill_diagonal(A, 1)
    for i in range(n):
        for j in range(i + 1, n):
            A[j, i] = 1 / A[i, j]
    r = ahp(A)
    ahp_cases.append(dict(A=A.tolist(), **r))

json.dump(dict(cases=out, ahp=ahp_cases), open(sys.argv[1], 'w'))
print('ok', len(out), len(ahp_cases))
