import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fr } from '@/i18n/fr';
import { useNarrowScreen } from '@/shell/viewport';
import type { EndMap } from './end-map';
import { drawUne } from './une';
import type { FinalEdition } from './words';

const said = fr.finalEdition.une;

/**
 * **La feuille qui montre la une avant de l'enregistrer** : l'image telle qu'elle partira, une
 * case pour le pied (ma ligne par défaut, ou rien de moi), et l'enregistrement. Au téléphone,
 * `navigator.share` quand il accepte un fichier : iOS ne télécharge pas un blob par `a.download`.
 */
export function UneSheet({
  edition,
  map,
  onClose,
}: {
  edition: FinalEdition;
  map: EndMap;
  onClose: () => void;
}) {
  const narrow = useNarrowScreen();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [withMine, setWithMine] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const file = said.file(edition.code);

  useEffect(() => {
    if (canvas.current !== null) void drawUne(canvas.current, edition, map, withMine);
  }, [edition, map, withMine]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () =>
    canvas.current?.toBlob((blob) => {
      if (blob === null) return;
      const image = new File([blob], file, { type: 'image/png' });
      if (navigator.canShare?.({ files: [image] }) === true) {
        void navigator.share({ files: [image], title: fr.masthead.title }).catch(() => {});
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      setSaved(said.saved(file));
    }, 'image/png');

  return createPortal(
    <div
      className={`fe-veil ${narrow ? 'phone' : ''}`}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="fe-une paper-grain" role="dialog" aria-modal aria-label={said.kicker}>
        <canvas ref={canvas} aria-label={said.kicker} />
        <aside>
          <span className="kicker">{said.kicker}</span>
          <h2>{said.title}</h2>
          <p>{said.note}</p>
          <span className="kicker">{said.foot}</span>
          <div className="seg">
            <button type="button" aria-pressed={withMine} onClick={() => setWithMine(true)}>
              {said.mine}
            </button>
            <button type="button" aria-pressed={!withMine} onClick={() => setWithMine(false)}>
              {said.neutral}
            </button>
          </div>
          <p style={{ fontSize: 13 }}>{said.mineNote}</p>
          <span style={{ flex: 1 }} />
          <p className="saved" role="status">
            {saved}
          </p>
          <button type="button" className="fe-btn solid" onClick={save}>
            {said.save}
          </button>
          <button type="button" className="fe-btn" onClick={onClose}>
            {said.close}
          </button>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
