from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Any
import uuid

from sunstone_backend.ulf.geodesics import integrate_ray_from_cartesian, plebanski_tensor_from_metric
from fastapi import BackgroundTasks
from sunstone_backend.settings import get_settings
import os
import json

router = APIRouter(prefix="/ulf", tags=["ulf"])

class Point(BaseModel):
    x: float
    y: float
    z: float = 0.0

class Source(BaseModel):
    kind: str = "point"  # 'point' or 'beam'
    position: Point
    direction: Point | None = None
    strength: float | None = None

class SceneObject(BaseModel):
    id: str
    kind: str  # e.g., 'schwarzschild', 'cylinder', 'cosmic_string'
    params: dict = {}
    center: Point | None = None

class TraceRequest(BaseModel):
    objects: List[SceneObject] = []
    sources: List[Source]
    samples: int = 200
    # If model == 'schwarzschild', attempt GR-based geodesic integration
    model: str | None = None

class TracePoint(BaseModel):
    x: float
    y: float
    z: float | None = 0.0

class MetricSample(BaseModel):
    r: float
    eps: List[List[float]]
    mu: List[List[float]]
    xi: List[List[float]] | None = None
    zeta: List[List[float]] | None = None

class TraceResult(BaseModel):
    points: List[TracePoint]
    metric_samples: List[MetricSample] | None = None

class TraceResponse(BaseModel):
    id: str
    traces: List[TraceResult]
    constitutive: dict | None = None


from fastapi import BackgroundTasks


@router.post("/trace", response_model=TraceResponse)
def trace_scene(req: TraceRequest) -> TraceResponse:
    """Trace endpoint. If `req.model == 'schwarzschild'` and a Schwarzschild object is present,
    perform a Schwarzschild orbital integration and return metric + constitutive samples.
    Otherwise fall back to straight-line traces as before (POC behavior).
    """
    traces: List[TraceResult] = []

    # detect a schwarzschild object if present
    sch_obj = None
    for o in req.objects:
        if o.kind == 'schwarzschild':
            sch_obj = o
            break

    for src in req.sources:
        pts = []
        metric_samples = []
        if req.model == 'schwarzschild' and sch_obj and src.direction:
            # Use Schwarzschild integrator in isotropic coordinates.
            M = float(sch_obj.params.get('M', 1.0))
            cx = float(sch_obj.center.x) if sch_obj.center else 0.0
            cy = float(sch_obj.center.y) if sch_obj.center else 0.0
            x0 = float(src.position.x) - cx
            y0 = float(src.position.y) - cy
            dx = float(src.direction.x)
            dy = float(src.direction.y)
            out, r_values = integrate_ray_from_cartesian(x0, y0, dx, dy, M, samples=req.samples)
            for (x, y), r in zip(out, r_values):
                pts.append(TracePoint(x=x + cx, y=y + cy, z=0.0))
                # Use improved Plebanski mapping via isotropic Schwarzschild metric
                eps, mu, xi, zeta = plebanski_tensor_from_metric(x + cx, y + cy, 0.0, M)
                metric_samples.append({'r': r, 'eps': eps, 'mu': mu, 'xi': xi, 'zeta': zeta})
            traces.append(TraceResult(points=pts, metric_samples=metric_samples))
        else:
            # Fallback: straight line or radial fan as earlier
            if src.direction:
                dx = src.direction.x
                dy = src.direction.y
                dz = src.direction.z if src.direction.z is not None else 0.0
                # normalize
                norm = (dx*dx + dy*dy + dz*dz) ** 0.5
                if norm == 0:
                    dx, dy, dz = 1.0, 0.0, 0.0
                    norm = 1.0
                dx /= norm; dy /= norm; dz /= norm
                length = 1.0
                for i in range(req.samples):
                    t = (i / max(1, req.samples-1)) * length
                    pts.append(TracePoint(x=src.position.x + dx * t, y=src.position.y + dy * t, z=src.position.z + dz * t))
            else:
                # radial fan of few rays
                for k in range(5):
                    angle = (k / 5.0) * 2.0 * 3.141592653589793
                    dx = 0.5 * (1.0 + 0.5 * k) * float(__import__('math').cos(angle))
                    dy = 0.5 * (1.0 + 0.5 * k) * float(__import__('math').sin(angle))
                    for i in range(req.samples // 5):
                        t = (i / max(1, req.samples//5 - 1)) * 0.8
                        pts.append(TracePoint(x=src.position.x + dx * t, y=src.position.y + dy * t))
            traces.append(TraceResult(points=pts))

    constitutive = None
    return TraceResponse(id=str(uuid.uuid4()), traces=traces, constitutive=constitutive)


# --- Background trace job endpoints ---
JOBS_INDEX_NAME = 'jobs_index.json'


def _jobs_index_path(settings):
    return os.path.join(str(settings.data_dir), 'ulf', 'jobs', JOBS_INDEX_NAME)


def _load_jobs(settings):
    p = _jobs_index_path(settings)
    if os.path.exists(p):
        try:
            with open(p, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_jobs(settings, jobs):
    p = _jobs_index_path(settings)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        json.dump(jobs, f)


_jobs: dict = {}

@router.post("/trace_job")
def start_trace_job(req: TraceRequest, background: BackgroundTasks):
    """Start a background trace job and return a job id. Results are written to disk under data_dir/ulf/jobs/<job_id>.json"""
    settings = get_settings()
    data_dir = os.path.join(str(settings.data_dir), 'ulf', 'jobs')
    os.makedirs(data_dir, exist_ok=True)
    # Load persisted index
    global _jobs
    _jobs = _load_jobs(settings) or {}

    job_id = str(uuid.uuid4())
    _jobs[job_id] = { 'status': 'pending', 'path': None }
    _save_jobs(settings, _jobs)

    def _worker(jid: str, payload: dict):
        try:
            # Reconstruct TraceRequest-like dict
            objects = payload.get('objects', [])
            sources = payload.get('sources', [])
            samples = int(payload.get('samples', 200))
            model = payload.get('model', None)

            # Simple reuse of trace logic: perform traces synchronously and write results
            traces_out = []
            sch_obj = None
            for o in objects:
                if o.get('kind') == 'schwarzschild':
                    sch_obj = o
                    break
            for src in sources:
                pts = []
                metric_samples = []
                if model == 'schwarzschild' and sch_obj and src.get('direction'):
                    M = float(sch_obj.get('params', {}).get('M', 1.0))
                    cx = float(sch_obj.get('center', {}).get('x', 0.0))
                    cy = float(sch_obj.get('center', {}).get('y', 0.0))
                    x0 = float(src.get('position', {}).get('x', 0.0)) - cx
                    y0 = float(src.get('position', {}).get('y', 0.0)) - cy
                    dx = float(src.get('direction', {}).get('x', 1.0))
                    dy = float(src.get('direction', {}).get('y', 0.0))
                    out, r_values = integrate_ray_from_cartesian(x0, y0, dx, dy, M, samples=samples)
                    for (x, y), r in zip(out, r_values):
                        pts.append({ 'x': x + cx, 'y': y + cy, 'z': 0.0 })
                        eps, mu, xi, zeta = plebanski_tensor_from_metric(x + cx, y + cy, 0.0, M)
                        metric_samples.append({ 'r': r, 'eps': eps, 'mu': mu, 'xi': xi, 'zeta': zeta })
                else:
                    # simple straight-line fallback
                    if src.get('direction'):
                        dx = float(src.get('direction', {}).get('x', 1.0))
                        dy = float(src.get('direction', {}).get('y', 0.0))
                        dz = float(src.get('direction', {}).get('z', 0.0))
                        norm = (dx*dx + dy*dy + dz*dz) ** 0.5
                        if norm == 0:
                            dx, dy, dz = 1.0, 0.0, 0.0
                            norm = 1.0
                        dx /= norm; dy /= norm; dz /= norm
                        length = 1.0
                        for i in range(samples):
                            t = (i / max(1, samples-1)) * length
                            pts.append({ 'x': src.get('position', {}).get('x', 0.0) + dx * t, 'y': src.get('position', {}).get('y', 0.0) + dy * t, 'z': src.get('position', {}).get('z', 0.0) + dz * t })
                traces_out.append({'points': pts, 'metric_samples': metric_samples})
            result = {'id': job_id, 'traces': traces_out}
            path = os.path.join(data_dir, f"{job_id}.json")
            with open(path, 'w') as f:
                json.dump(result, f)
            _jobs[jid]['status'] = 'done'
            _jobs[jid]['path'] = path
            _save_jobs(settings, _jobs)
        except Exception as e:
            _jobs[jid]['status'] = 'error'
            _jobs[jid]['error'] = str(e)
            _save_jobs(settings, _jobs)

    background.add_task(_worker, job_id, req.model_dump())
    _jobs[job_id]['status'] = 'running'
    _save_jobs(settings, _jobs)
    return { 'job_id': job_id }


@router.get('/trace_job/{job_id}')
def get_trace_job(job_id: str):
    settings = get_settings()
    global _jobs
    _jobs = _load_jobs(settings) or {}
    info = _jobs.get(job_id)
    if not info:
        return { 'status': 'not_found' }
    if info.get('status') == 'done' and info.get('path'):
        try:
            with open(info['path'], 'r') as f:
                return { 'status': 'done', 'result': json.load(f) }
        except Exception:
            return { 'status': 'done', 'result': None }
    return { 'status': info.get('status') }

