"""Independent reference implementation for engine fixtures (float math, separate code path).

Reads packages/engine/test/fixtures/*.json, computes the 10% test by hand-style arithmetic,
writes expected scenario values back into each fixture and a companion Excel workbook with
live formulas to fixtures/excel/<id>.xlsx.  Run: python3 fixtures/reference.py
"""
import json, glob, os, calendar, itertools
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font

ROOT = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(ROOT, "..", "packages", "engine", "test", "fixtures")
BLUE = Font(color="0000FF")
MONTHS = {"monthly": 1, "quarterly": 3, "semiannual": 6, "annual": 12}

def D(s): return date.fromisoformat(s)

def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year; m += 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))

def yf(a, b, dc):
    if dc == "ACT/360": return (b - a).days / 360
    if dc == "ACT/365": return (b - a).days / 365
    d1, d2 = min(a.day, 30), b.day
    if d2 == 31 and d1 == 30: d2 = 30
    return (360 * (b.year - a.year) + 30 * (b.month - a.month) + d2 - d1) / 360

def rate(i):
    if i["rateType"] == "fixed": return float(i["fixedRate"])
    idx = float(i["indexRateAtModificationDate"])
    if "floor" in i: idx = max(idx, float(i["floor"]))
    if "cap" in i: idx = min(idx, float(i["cap"]))
    return idx + float(i["spread"])

def flows(i, mod, ex=None):
    """Bullet instruments only (all fixtures 1-7). Returns [(date, interest_accrual, principal_factor)]."""
    mat = D(i["maturityDate"]); m = MONTHS[i["paymentFrequency"]]
    ds = []; k = 0
    while True:
        dt = add_months(mat, -k * m); ds.append(dt); k += 1
        if dt <= mod: break
    ds.reverse()
    if ex:
        ds = [x for x in ds if x < ex[0]] + [ex[0]]
    out = []
    for a, b in zip(ds, ds[1:]):
        last = b == ds[-1]
        out.append((b, yf(a, b, i["dayCount"]), (ex[1] if ex else 1.0) if last else 0.0))
    return out

def choices(i, mod, mat):
    c = [None]
    for o in i.get("callOptions", []) + i.get("putOptions", []):
        for e in o["exerciseDates"]:
            if mod < D(e) <= mat: c.append((D(e), float(o["price"])))
    return c

def pv(fl, P, r, eir, mod):
    return sum((P * r * acc + P * pf) * (1 + eir) ** (-(d - mod).days / 365) for d, acc, pf in fl)

def sheet(wb, title, inst, fl, mod_cell="Inputs!$B$1", eir_cell="Inputs!$B$2"):
    ws = wb.create_sheet(title[:31])
    ws.append(["Principal", float(inst["principalOutstanding"])]); ws["B1"].font = BLUE
    ws.append(["Coupon rate", rate(inst)]); ws["B2"].font = BLUE
    ws.append(["Date", "Accrual fraction", "Principal factor", "Interest", "Principal", "Total", "Days", "DF", "PV"])
    for n, (d, acc, pf) in enumerate(fl, start=4):
        ws.append([d, acc, pf, f"=$B$1*$B$2*B{n}", f"=$B$1*C{n}", f"=D{n}+E{n}",
                   f"=A{n}-{mod_cell}", f"=(1+{eir_cell})^(-G{n}/365)", f"=F{n}*H{n}"])
        for c in "ABC": ws[f"{c}{n}"].font = BLUE
    last = 3 + len(fl)
    ws.append(["Total PV", None, None, None, None, None, None, None, f"=SUM(I4:I{last})"])
    return f"'{ws.title}'!I{last+1}"

for path in sorted(glob.glob(os.path.join(FIX, "*.json"))):
    fx = json.load(open(path)); inp = fx["input"]
    mod = D(inp["modificationDate"]); eir = float(inp["originalEffectiveRate"])
    old = inp["originalTerms"]
    for p in inp.get("priorModificationsWithin1Year", []):
        if (mod.replace(year=mod.year - 1)) <= D(p["modificationDate"]) < mod: old = p["termsBefore"]
    new = inp["newTerms"]
    fees = sum(float(f["amount"]) for f in inp.get("feesPaidToLender", [])) - sum(float(f["amount"]) for f in inp.get("feesReceivedFromLender", []))
    wb = Workbook(); ws = wb.active; ws.title = "Inputs"
    ws.append(["Modification date", mod]); ws.append(["Original effective rate", eir]); ws.append(["Net fees paid to lender (t=0)", fees])
    for c in ("B1", "B2", "B3"): ws[c].font = BLUE
    ws.append([]); ws.append(["Scenario", "PV old", "PV new (incl. fees)", "% change"])
    scen = []
    for n, (oc, nc) in enumerate(itertools.product(choices(old, mod, D(old["maturityDate"])), choices(new, mod, D(new["maturityDate"]))), start=1):
        fo, fn = flows(old, mod, oc), flows(new, mod, nc)
        po = pv(fo, float(old["principalOutstanding"]), rate(old), eir, mod)
        pn = pv(fn, float(new["principalOutstanding"]), rate(new), eir, mod) + fees
        scen.append({"pvOld": round(po, 2), "pvNew": round(pn, 2), "pctChange": round(abs(pn - po) / po * 100, 4)})
        ro = sheet(wb, f"S{n} Old CF", old, fo); rn = sheet(wb, f"S{n} New CF", new, fn)
        r = 5 + n
        ws.append([f"S{n}", f"={ro}", f"={rn}+$B$3", f"=ABS(C{r}-B{r})/B{r}"])
    ctrl = min(scen, key=lambda s: s["pctChange"])
    ws.append([]); ws.append(["Controlling % change", f"=MIN(D6:D{5+len(scen)})"])
    ws.append(["Conclusion", f'=IF(B{7+len(scen)}>=0.1,"Extinguishment","Modification")'])
    fx["expected"]["scenarios"] = scen
    fx["expected"]["controllingPctChange"] = ctrl["pctChange"]
    fx["expected"]["conclusion"] = "extinguishment" if ctrl["pctChange"] >= 10 else "modification"
    json.dump(fx, open(path, "w"), indent=2)
    os.makedirs(os.path.join(ROOT, "excel"), exist_ok=True)
    wb.save(os.path.join(ROOT, "excel", fx["id"] + ".xlsx"))
    print(f'{fx["id"]:28s} ctrl {ctrl["pctChange"]:8.4f}%  {fx["expected"]["conclusion"]}  {scen}')
