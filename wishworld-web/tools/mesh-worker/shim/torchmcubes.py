"""Stand-in for the torchmcubes package, which needs a C++ compiler and CMake to install.

TripoSR only uses torchmcubes.marching_cubes(volume, threshold). This does the same job with
scikit-image (which installs from a ready-made wheel) and returns what TripoSR expects from torchmcubes:
vertices as a float tensor with coordinates in reversed axis order (z, y, x), which TripoSR then swaps
back, and faces as a long tensor. worker.py checks the winding afterwards, so it is left as it comes.
"""
import numpy as np
import torch
from skimage import measure


def marching_cubes(volume: torch.Tensor, threshold: float):
    data = volume.detach().cpu().numpy().astype(np.float32)
    verts, faces, _normals, _values = measure.marching_cubes(data, level=float(threshold))
    verts = np.ascontiguousarray(verts[:, ::-1])
    return torch.from_numpy(verts.astype(np.float32)), torch.from_numpy(faces.astype(np.int64))
