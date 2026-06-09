import React, { useEffect, useRef, useState } from 'react';
import { sendVoiceMessage } from '../../firebase/chat';

// VoiceRecorder: records audio (webm), allows playback and uploading via sendVoiceMessage
// Props: lobbyId, currentUser { uid }
export default function VoiceRecorder({ lobbyId, currentUser }) {
  const [recording, setRecording] = useState(false);
  const [mediaAvailable, setMediaAvailable] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    // feature-detect
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setMediaAvailable(true);
    }
  }, []);

  const start = async () => {
    if (!mediaAvailable) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(b);
        setBlobUrl(URL.createObjectURL(b));
        // stop all tracks
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch (_e) {
          /* ignore stop errors */
        }
      };
      mr.start();
      setRecording(true);
    } catch (e) {
       
      console.error('Microphone access denied', e);
    }
  };

  const stop = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    setRecording(false);
  };

  const handleUpload = async () => {
    if (!blob || !lobbyId || !currentUser) return;
    setUploading(true);
    try {
      await sendVoiceMessage(lobbyId, currentUser.uid, blob);
      // clear blob after send
      setBlob(null);
      setBlobUrl(null);
    } catch (e) {
       
      console.error('Voice upload failed', e);
    }
    setUploading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={recording ? stop : start} disabled={!mediaAvailable} style={{ padding: 8, borderRadius: 6 }}>
          {recording ? 'Stop' : 'Record'}
        </button>
        {blobUrl && (
          <audio controls src={blobUrl} />
        )}
        {blob && (
          <button onClick={handleUpload} disabled={uploading} style={{ padding: 8, borderRadius: 6, background: '#1da1f2', color: '#fff', border: 'none' }}>
            {uploading ? 'Uploading...' : 'Send Voice'}
          </button>
        )}
      </div>
    </div>
  );
}
