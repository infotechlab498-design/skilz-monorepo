import EnigmaPulseBootView from './EnigmaPulseBootView.jsx';

/**
 * @deprecated Use EnigmaPulseBootView with variant="word_cipher".
 * Kept for imports that predated the unified boot shell.
 */
export default function WordCipherConnecting({ message = 'Connecting to room…', subtitle = '' }) {
  return (
    <EnigmaPulseBootView
      variant="word_cipher"
      phase="connecting"
      headline={message}
      subtitle={subtitle}
    />
  );
}
