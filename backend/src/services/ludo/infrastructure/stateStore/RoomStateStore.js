export class RoomStateStore {
  constructor(adapter) {
    this.adapter = adapter;
  }

  get(roomId) {
    return this.adapter.get(roomId);
  }

  set(roomId, state) {
    return this.adapter.set(roomId, state);
  }

  delete(roomId) {
    return this.adapter.delete(roomId);
  }

  has(roomId) {
    return this.adapter.has(roomId);
  }

  entries() {
    return this.adapter.entries();
  }
}
