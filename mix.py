"""Original procedural sound for the swarm test. Every click, key and snap comes from the page's own event list.
Usage: python mix.py <events.json> <frames> <out.wav>"""
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR, FPS = 48000, 60
events = json.load(open(sys.argv[1])); FR = int(sys.argv[2])
L = int(FR / FPS * SR); out = np.zeros((2, L)); rng = np.random.default_rng(3)
def at(f): return int(round(f / FPS * SR))
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def hp(x, c): return sosfilt(butter(2, c, 'high', fs=SR, output='sos'), x)
def lp(x, c): return sosfilt(butter(2, c, 'low', fs=SR, output='sos'), x)
def env(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def add(sig, i, g=1., pan=0.):
    a, b = max(0, i), min(L, i + len(sig))
    if b > a:
        out[0, a:b] += sig[a - i:b - i] * g * np.sqrt(.5 * (1 - pan)) * 1.414
        out[1, a:b] += sig[a - i:b - i] * g * np.sqrt(.5 * (1 + pan)) * 1.414
def click(bright=1.):
    n = int(.025 * SR); c = bp(rng.standard_normal(n), 1800 * bright, 7000) * env(n, .0025)
    t = np.arange(n) / SR; return c + np.sin(2 * np.pi * rng.uniform(2200, 3400) * bright * t) * env(n, .004) * .4
def key():
    n = int(.06 * SR); t = np.arange(n) / SR
    thock = np.sin(2 * np.pi * rng.uniform(180, 260) * t) * env(n, .012) * .6
    clack = bp(rng.standard_normal(n), 2500, 9000) * env(n, .004)
    return thock + clack
def snap():
    n = int(.12 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * rng.uniform(700, 1100) * t * (1 + 2 * env(n, .01))) * env(n, .03) * .5 + np.pad(click(1.3), (0, n - int(.025 * SR))) * .6
def pop():
    n = int(.18 * SR); t = np.arange(n) / SR; f = 300 + 900 * (1 - env(n, .02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, .05) * .6
def whoosh(len_s, rev=False):
    n = int(len_s * SR); x = rng.standard_normal(n); o = np.zeros(n); seg = 512
    for i in range(0, n, seg):
        c = 300 * 30 ** (i / n); o[i:i + seg] = bp(x[max(0, i - 2048):i + seg], c, min(c * 3, 20000))[-len(x[i:i + seg]):]
    o *= np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return o[::-1] if rev else o

for e in events:
    i, p, g = at(e['f']), e['pan'] * .8, e['gain']
    t = e['type']
    if t == 'key': add(key(), i + rng.integers(-60, 60), .32 * g, p)
    elif t == 'tick': add(click(rng.uniform(.8, 1.3)), i + rng.integers(-200, 200), .12 * g, p)
    elif t in ('click', 'release'): add(click(.9 if t == 'click' else 1.2), i, .5, p)
    elif t == 'snap': add(snap(), i, .4 * g, p)
    elif t == 'pop': add(pop(), i, .45, p)
    elif t == 'paint': add(whoosh(.5), i - int(.1 * SR), .35, p)
    elif t == 'bigclick':
        add(click(.7), i, .9, p); n = int(.9 * SR); tt = np.arange(n) / SR
        add(sum(np.sin(2 * np.pi * f0 * tt) for f0 in (523.25, 659.25, 783.99, 1046.5)) * env(n, .35) * .18, i, 1, p)
    elif t == 'whoosh': add(whoosh(1.1), i - int(.3 * SR), .5)
    elif t == 'word': add(pop() * .5, i, .18, 0)
    elif t == 'riser':
        n = int(1.33 * SR); tt = np.arange(n) / SR; fr = 180 * 2 ** (tt / 1.33 * 2.5)
        tone = np.sin(2 * np.pi * np.cumsum(fr) / SR) + .5 * np.sin(4 * np.pi * np.cumsum(fr) / SR)
        nz = hp(rng.standard_normal(n), 3000) * .4
        add((tone * .5 + nz) * (tt / 1.33) ** 2.4, i, .35)
    elif t == 'impact':
        n = int(2.2 * SR); tt = np.arange(n) / SR
        boom = np.tanh(2 * np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-tt / .2)) / SR)) * env(n, .6) * .8
        chord = sum(np.sin(2 * np.pi * f0 * tt) + .3 * np.sin(4 * np.pi * f0 * tt) for f0 in (220, 277.18, 329.63, 440, 554.37)) / 5 * env(n, 1.4) * .5
        add(boom + lp(rng.standard_normal(n), 2500) * env(n, .12) * .5 + chord, i, .9)

# soft pulse bed: 120 bpm sub + airy pad, so the clicks sit on a rhythm
t = np.arange(L) / SR; beat = 0.5
bed = np.zeros(L)
for k in np.arange(.65, L / SR, beat):
    i = int(k * SR); n = int(.35 * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * (45 + 80 * np.exp(-tt / .03)) * tt) * env(n, .12)
    a, b = i, min(L, i + n); bed[a:b] += s[:b - a] * .5
pad = sum(np.sin(2 * np.pi * f0 * t + np.sin(2 * np.pi * .3 * t) * 2) for f0 in (220, 277.18, 329.63, 415.3)) / 4
pad = lp(pad, 1500) * np.clip(t / 1.2, 0, 1) * .12
mix = out + np.vstack([bed + pad, bed + pad]) * np.clip((t - .55) / .2, 0, 1)
ir = rng.standard_normal(int(.9 * SR)) * np.exp(-np.arange(int(.9 * SR)) / (.18 * SR)); ir = lp(ir, 5000); ir /= np.sqrt((ir ** 2).sum())
wet = np.vstack([fftconvolve(mix[0], ir)[:L], fftconvolve(mix[1], np.roll(ir, 211))[:L]])
mix = hp(mix * .82 + wet * .25, 30)
mix = np.tanh(mix * 1.2) / np.tanh(1.2); mix *= .9 / np.abs(mix).max()
mix[:, -480:] *= np.linspace(1, 0, 480)
wavfile.write(sys.argv[3], SR, (mix.T * 32767).astype(np.int16)); print('ok', mix.shape)
