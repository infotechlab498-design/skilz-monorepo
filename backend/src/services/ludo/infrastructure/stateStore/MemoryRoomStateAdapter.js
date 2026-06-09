export class MemoryRoomStateAdapter {
  constructor(seedMap) {
    this.map = seedMap instanceof Map ? seedMap : new Map();
  }

  get(roomId) {
    return this.map.get(roomId);
  }

  set(roomId, state) {
    this.map.set(roomId, state);
    return state;
  }

  delete(roomId) {
    return this.map.delete(roomId);
  }

  has(roomId) {
    return this.map.has(roomId);
  }

  entries() {
    return this.map.entries();
  }
}
