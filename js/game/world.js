// 資料驅動的世界模型：房間（軸對齊矩形）＋門（牆上的開口）。
// 純邏輯模組——不 import three、不碰 DOM，可在 node --test 下測試。
//
// 座標約定：x 向東、z 向南。房間 (x,z) 為最小角，w 沿 x、d 沿 z、h 高。
// 門 axis 'x'：門洞沿 x 展開（開在 z=at[1] 的牆上）；axis 'z' 反之。
const EPS = 1e-6;

export class World {
  constructor(levelData) {
    this.data = levelData;
    this.rooms = new Map();
    for (const r of levelData.rooms) this.rooms.set(r.id, r);
    this.doors = new Map();
    for (const d of levelData.doors) this.doors.set(d.id, { ...d, open: false });
    this.lockNames = levelData.lockNames || {};
    this.props = levelData.props || [];
    this._wallCache = new Map();
  }

  // 靜態牆段（門洞已扣除），格式 [x1,z1,x2,z2]。結果快取。
  wallSegments(roomId) {
    if (this._wallCache.has(roomId)) return this._wallCache.get(roomId);
    const r = this.rooms.get(roomId);
    const segs = [
      ...splitEdge(r.x, r.x + r.w, r.z, 'x', this._openingsOn(r, 'x', r.z)),
      ...splitEdge(r.x, r.x + r.w, r.z + r.d, 'x', this._openingsOn(r, 'x', r.z + r.d)),
      ...splitEdge(r.z, r.z + r.d, r.x, 'z', this._openingsOn(r, 'z', r.x)),
      ...splitEdge(r.z, r.z + r.d, r.x + r.w, 'z', this._openingsOn(r, 'z', r.x + r.w)),
    ];
    // 實心道具（solid=半邊長）→ 方形障礙，玩家與敵人都會被擋
    for (const p of this.props) {
      if (!p.solid || p.room !== roomId) continue;
      const s = p.solid;
      segs.push(
        [p.x - s, p.z - s, p.x + s, p.z - s],
        [p.x + s, p.z - s, p.x + s, p.z + s],
        [p.x + s, p.z + s, p.x - s, p.z + s],
        [p.x - s, p.z + s, p.x - s, p.z - s]
      );
    }
    this._wallCache.set(roomId, segs);
    return segs;
  }

  _openingsOn(room, axis, lineCoord) {
    const list = [];
    for (const d of this.doors.values()) {
      if (d.axis !== axis) continue;
      if (d.from !== room.id && d.to !== room.id) continue;
      const line = axis === 'x' ? d.at[1] : d.at[0];
      const along = axis === 'x' ? d.at[0] : d.at[1];
      if (Math.abs(line - lineCoord) > EPS) continue;
      list.push([along - d.width / 2, along + d.width / 2]);
    }
    return list.sort((a, b) => a[0] - b[0]);
  }

  // 門洞本身的線段（門關閉時作為碰撞牆）。
  doorSegment(doorId) {
    const d = this.doors.get(doorId);
    return d.axis === 'x'
      ? [d.at[0] - d.width / 2, d.at[1], d.at[0] + d.width / 2, d.at[1]]
      : [d.at[0], d.at[1] - d.width / 2, d.at[0], d.at[1] + d.width / 2];
  }

  // 碰撞段＝靜態牆＋該房間所有「關閉中」的門。
  collisionSegments(roomId) {
    const segs = this.wallSegments(roomId).slice();
    for (const d of this.doors.values()) {
      if (d.from !== roomId && d.to !== roomId) continue;
      if (!d.open) segs.push(this.doorSegment(d.id));
    }
    return segs;
  }

  doorsOfRoom(roomId) {
    return [...this.doors.values()].filter((d) => d.from === roomId || d.to === roomId);
  }

  setDoorOpen(doorId, open) {
    this.doors.get(doorId).open = open;
  }

  // 經由「未上鎖」的門可到達的房間集合（BFS）。
  reachableRooms(fromId, { ignoreLocks = false } = {}) {
    const seen = new Set([fromId]);
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      for (const d of this.doorsOfRoom(cur)) {
        if (!ignoreLocks && d.lock) continue;
        const other = d.from === cur ? d.to : d.from;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    return seen;
  }

  // 敵人尋路：從 fromId 往 toId，下一步該走哪扇「開著的門」（BFS）。
  // 敵人不會開門，所以只走 open 的門；無路可走回 null。
  nextDoorToward(fromId, toId) {
    if (fromId === toId) return null;
    const prev = new Map([[fromId, null]]); // roomId → {room, door}
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      for (const d of this.doorsOfRoom(cur)) {
        if (!d.open || !d.to) continue;
        const other = d.from === cur ? d.to : d.from;
        if (prev.has(other)) continue;
        prev.set(other, { room: cur, door: d.id });
        if (other === toId) {
          // 回溯到起點的第一扇門
          let node = other;
          while (prev.get(node).room !== fromId) node = prev.get(node).room;
          return prev.get(node).door;
        }
        queue.push(other);
      }
    }
    return null;
  }

  roomAt(x, z) {
    for (const r of this.rooms.values()) {
      if (x >= r.x - EPS && x <= r.x + r.w + EPS && z >= r.z - EPS && z <= r.z + r.d + EPS) {
        return r.id;
      }
    }
    return null;
  }
}

// 沿主軸 a0→a1 的一條邊，扣掉已排序的開口 [start,end]，切成子線段。
function splitEdge(a0, a1, lineCoord, axis, openings) {
  const segs = [];
  let cur = a0;
  for (const [s, e] of openings) {
    if (s > cur + EPS) segs.push(makeSeg(cur, Math.min(s, a1), lineCoord, axis));
    cur = Math.max(cur, e);
  }
  if (cur < a1 - EPS) segs.push(makeSeg(cur, a1, lineCoord, axis));
  return segs;
}

function makeSeg(a0, a1, lineCoord, axis) {
  return axis === 'x' ? [a0, lineCoord, a1, lineCoord] : [lineCoord, a0, lineCoord, a1];
}
