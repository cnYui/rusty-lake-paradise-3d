"""直接解码游戏运行时网格，检查量化后是否有重复面、退化面、非流形边和非法坐标。"""
import base64
import json
import re
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
def main():
    source=(ROOT/'src/art/deer_skull_mesh.js').read_text(encoding='utf-8')
    chunks=re.findall(r"decode\('([^']+)'\)",source)
    low,span=re.search(r'const low=(\[.*?\]),span=(\[.*?\]);',source).groups()
    positions=np.frombuffer(base64.b64decode(chunks[0]),dtype=np.uint16).reshape(-1,3).astype(np.float64)/65535*np.array(json.loads(span))+np.array(json.loads(low))
    dtype=np.uint32 if 'new Uint32Array(decode' in source else np.uint16
    index=np.frombuffer(base64.b64decode(chunks[2]),dtype=dtype).reshape(-1,3)
    area=np.linalg.norm(np.cross(positions[index[:,1]]-positions[index[:,0]],positions[index[:,2]]-positions[index[:,0]]),axis=1)*.5
    _,faces=np.unique(np.sort(index,axis=1),axis=0,return_counts=True)
    edges=np.sort(np.concatenate([index[:,[0,1]],index[:,[1,2]],index[:,[2,0]]]),axis=1)
    _,counts=np.unique(edges,axis=0,return_counts=True)
    report={'vertices':len(positions),'triangles':len(index),'nonFiniteVertices':int((~np.isfinite(positions)).sum()),'duplicateTriangles':int((faces>1).sum()),'degenerateTriangles':int((area<1e-14).sum()),'nonManifoldEdges':int((counts!=2).sum())}
    assert not any(report[k] for k in ['nonFiniteVertices','duplicateTriangles','degenerateTriangles','nonManifoldEdges']),report
    out=ROOT/'dev/common/media/remodel_20261114/skull_sculpt';out.mkdir(parents=True,exist_ok=True)
    (out/'quantized_mesh_check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report),flush=True)

if __name__=='__main__':main()
