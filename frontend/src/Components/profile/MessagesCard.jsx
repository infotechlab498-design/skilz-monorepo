import React from 'react';

const FALLBACK_MESSAGES = [
  {
    id: 'm1',
    uid: 'player_sophie',
    name: 'Sophie B.',
    preview: 'Hi! I need more information…',
    avatar: 'https://i.pravatar.cc/80?img=5',
  },
  {
    id: 'm2',
    uid: 'player_anne',
    name: 'Anne Marie',
    preview: 'Awesome work, can you…',
    avatar: 'https://i.pravatar.cc/80?img=32',
  },
  {
    id: 'm3',
    uid: 'player_ivan',
    name: 'Ivan',
    preview: 'About files I can…',
    avatar: 'https://i.pravatar.cc/80?img=12',
  },
  {
    id: 'm4',
    uid: 'player_peterson',
    name: 'Peterson',
    preview: 'Have a great afternoon…',
    avatar: 'https://i.pravatar.cc/80?img=22',
  },
  {
    id: 'm5',
    uid: 'player_nick',
    name: 'Nick Daniel',
    preview: 'Hi! I need more information…',
    avatar: 'https://i.pravatar.cc/80?img=48',
  },
];

/**
 * @param {{ items?: Array<{ id: string, uid: string, name: string, preview: string, avatar: string }>, onReply?: (player: { id: string, uid: string, name: string, avatar: string }) => void }} props
 */
export default function MessagesCard({ items = FALLBACK_MESSAGES, onReply }) {
  return (
    <section className="prf-crd" aria-labelledby="prf-msg-title">
      <div className="prf-crdHd">
        <h3 className="prf-crdT" id="prf-msg-title">
          Messages
        </h3>
      </div>

      {items.map((m) => (
        <div key={m.id} className="prf-msgIt">
          <div className="prf-msgL">
            <div className="prf-msgA" aria-hidden="true">
              {m.avatar ? <img src={m.avatar} alt="" /> : null}
            </div>
            <div className="prf-msgTxt">
              <p className="prf-msgNm">{m.name}</p>
              <p className="prf-msgPv">{m.preview}</p>
            </div>
          </div>
          <button
            type="button"
            className="prf-btn prf-btn--reply"
            onClick={() => onReply?.({ id: m.id, uid: m.uid, name: m.name, avatar: m.avatar })}
          >
            Reply
          </button>
        </div>
      ))}
    </section>
  );
}

