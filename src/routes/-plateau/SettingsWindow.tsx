import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { DestroyButton } from '@/shell/DestroyButton';
import { useCoarsePointer } from '@/shell/viewport';
import {
  DEFAULT_HUD_SCALE,
  MAX_HUD_SCALE,
  MIN_HUD_SCALE,
  keepHudScale,
  keepTableSound,
  keepTelegraphSound,
  readHudScale,
  tableSoundOn,
  telegraphSoundOn,
} from '@/data/settings';
import { setMapMotionSetting, useMapMotionSetting } from '@/data/mapMotion';
import { setDayCycle, useDayCycle } from '@/data/dayCycle';
import { DAY_CYCLES } from '@/domain/daylight';
import { setContourWeight, useContourWeight } from '@/data/contourWeight';
import { CONTOUR_WEIGHTS } from '@/domain/contours';
import { setPieceScale, usePieceScale } from '@/data/pieceScale';
import {
  MAX_PIECE_SCALE,
  MIN_PIECE_SCALE,
  PIECE_SCALE_STEP,
  parsePercent,
} from '@/domain/piece-scale';
import { MAP_MOTION_SETTINGS } from '@/domain/map-motion';
import { setMouseMapping, useMouseMapping } from '@/data/mouseMapping';
import {
  MOUSE_BUTTONS,
  MOUSE_PRESETS,
  MOUSE_ROLES,
  withRole,
  type MouseButton,
  type MouseMapping,
} from '@/domain/mouse-mapping';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';
import { forgetSession, type Seat } from '@/data/session';
import { currentPushEndpoint } from '@/data/pushDevice';
import { NotificationsSection } from './NotificationsSection';

export function SettingsWindow({
  seat,
  mayConclude,
  defeated,
  blitz,
  onClose,
  onShowBriefing,
  ...windowProps
}: WindowProps & {
  seat: Seat;
  mayConclude: boolean;
  defeated: boolean;
  blitz: boolean;
  onShowBriefing: () => void;
}) {
  const [scale, setScale] = useState(readHudScale);
  const [sound, setSound] = useState(telegraphSoundOn);
  const [tableSound, setTableSound] = useState(tableSoundOn);
  const mapping = useMouseMapping();
  const mapMotion = useMapMotionSetting();
  const dayCycle = useDayCycle();
  const contourWeight = useContourWeight();
  const pieces = usePieceScale();
  const coarse = useCoarsePointer();
  const conclude = useMutation(api.seasons.conclude);
  const surrender = useMutation(api.players.surrender);
  const logout = useMutation(api.accounts.logout);
  const logoutOthers = useMutation(api.accounts.logoutOthers);
  const [closedElsewhere, setClosedElsewhere] = useState<number | null>(null);
  const navigate = useNavigate();

  const set = (value: number) => {
    const clamped = Math.max(MIN_HUD_SCALE, Math.min(MAX_HUD_SCALE, value));
    setScale(clamped);
    keepHudScale(clamped);
  };

  return (
    <FloatingWindow name="settings" onClose={onClose} {...windowProps} width={420}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <WindowHead title={fr.settingsWindow.header} onClose={onClose} />

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-[14px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] text-[var(--ink)]">{fr.settingsWindow.scaleLabel}</span>
            <span className="font-(family-name:--font-mono) text-[15px] text-[var(--ink)]">
              {scale} %
            </span>
          </div>
          <div className="mt-3 flex items-center gap-[10px]">
            <Step sign="–" onClick={() => set(scale - 10)} disabled={scale <= MIN_HUD_SCALE} />
            <div className="relative h-[6px] flex-1 bg-(--ink)/14">
              <div
                className="h-[6px] bg-[var(--interaction)]"
                style={{
                  width: `${((scale - MIN_HUD_SCALE) / (MAX_HUD_SCALE - MIN_HUD_SCALE)) * 100}%`,
                }}
              />
            </div>
            <Step sign="+" onClick={() => set(scale + 10)} disabled={scale >= MAX_HUD_SCALE} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-[180px] flex-1 text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.scaleNote(MIN_HUD_SCALE, MAX_HUD_SCALE)}
            </span>
            <button
              type="button"
              onClick={() => set(DEFAULT_HUD_SCALE)}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.settingsWindow.reset}
            </button>
          </div>

          {/* **La grammaire de la carte ne change pas, quel bouton la porte est au joueur**
              (retour de la partie du 11/09). Deux presets nommés en tête pour qui veut choisir
              sans réfléchir, trois sélecteurs en dessous pour qui veut sa propre main. */}
          {coarse ? (
            <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
              <span className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.fingerLabel}
              </span>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.fingerNote}
              </p>
              <dl className="mt-[10px] flex flex-col gap-[7px] text-[11.5px]">
                {fr.mapUi.fingerGestures.map(({ gesture, effect }) => (
                  <div key={gesture} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-[var(--ink)]">{gesture}</dt>
                    <dd className="text-[var(--ink-soft)]">{effect}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13.5px] text-[var(--ink)]">
                  {fr.settingsWindow.mouseLabel}
                </span>
                <div className="flex gap-[6px]">
                  {MOUSE_PRESETS.map((preset) => (
                    <Chip
                      key={preset.key}
                      label={fr.settingsWindow.mousePreset[preset.key]}
                      marked={sameMapping(mapping, preset.mapping)}
                      onClick={() => setMouseMapping(preset.mapping)}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.mouseNote}
              </p>
              <div className="mt-[10px] flex flex-col gap-[7px]">
                {MOUSE_BUTTONS.map((button) => (
                  <div key={button} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[var(--ink)]">
                      {fr.mapUi.mouse.button[button]}
                    </span>
                    <div className="flex gap-[6px]">
                      {MOUSE_ROLES.map((role) => (
                        <Chip
                          key={role}
                          label={fr.mapUi.mouse.role[role]}
                          marked={mapping[button] === role}
                          onClick={() => setMouseMapping(withRole(mapping, button, role))}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* **Le son est un réglage à part.** `prefers-reduced-motion` parle d'animation, pas
              d'audio : s'en servir pour taire le télégraphe muterait un joueur qui n'a jamais
              demandé le silence. */}
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-2 border-t border-(color:--ink)/22 pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">{fr.settingsWindow.soundLabel}</div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.soundNote}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={sound}
              onClick={() => {
                setSound(!sound);
                keepTelegraphSound(!sound);
              }}
              className={
                sound
                  ? 'shrink-0 cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--paper)] uppercase'
                  : 'shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]'
              }
            >
              {fr.settingsWindow.soundState(sound)}
            </button>
          </div>
          <div className="mt-[14px] flex flex-wrap items-baseline justify-between gap-2 border-t border-(color:--ink)/22 pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.tableSoundLabel}
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.tableSoundNote}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={tableSound}
              onClick={() => {
                setTableSound(!tableSound);
                keepTableSound(!tableSound);
              }}
              className={
                tableSound
                  ? 'shrink-0 cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--paper)] uppercase'
                  : 'shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]'
              }
            >
              {fr.settingsWindow.soundState(tableSound)}
            </button>
          </div>

          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.motionLabel}
              </span>
              <div className="flex gap-[6px]">
                {MAP_MOTION_SETTINGS.map((setting) => (
                  <Chip
                    key={setting}
                    label={fr.settingsWindow.motion[setting]}
                    marked={mapMotion === setting}
                    onClick={() => setMapMotionSetting(setting)}
                  />
                ))}
              </div>
            </div>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.motionNote}
            </p>
          </div>

          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.dayCycleLabel}
              </span>
              <div className="flex gap-[6px]">
                {DAY_CYCLES.map((cycle) => (
                  <Chip
                    key={cycle}
                    label={fr.settingsWindow.dayCycle[cycle]}
                    marked={dayCycle === cycle}
                    onClick={() => setDayCycle(cycle)}
                  />
                ))}
              </div>
            </div>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.dayCycleNote}
            </p>
          </div>

          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.contourLabel}
              </span>
              <div className="flex gap-[6px]">
                {CONTOUR_WEIGHTS.map((weight) => (
                  <Chip
                    key={weight}
                    label={fr.settingsWindow.contour[weight]}
                    marked={contourWeight === weight}
                    onClick={() => setContourWeight(weight)}
                  />
                ))}
              </div>
            </div>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.contourNote}
            </p>
          </div>

          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <span className="text-[13.5px] text-[var(--ink)]">
              {fr.settingsWindow.pieceScaleLabel}
            </span>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.pieceScaleNote}
            </p>
            <label className="mt-[8px] flex items-center gap-3 text-[11.5px]">
              <input
                type="range"
                aria-label={fr.settingsWindow.pieceScaleLabel}
                min={MIN_PIECE_SCALE}
                max={MAX_PIECE_SCALE}
                step={PIECE_SCALE_STEP}
                value={pieces}
                onChange={(event) => setPieceScale(parsePercent(event.target.value))}
                className="min-w-0 flex-1 cursor-pointer accent-[var(--ink)]"
              />
              <span className="w-[44px] text-right tabular-nums text-[var(--ink-soft)]">
                {fr.settingsWindow.pieceScalePercent(pieces)}
              </span>
            </label>
          </div>

          <NotificationsSection seat={seat} blitz={blitz} />

          {/* La feuille d'entrée en campagne ne se rouvre d'office jamais : c'est ici, et
              nulle part ailleurs, qu'un joueur la retrouve. */}
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-2 border-t border-(color:--ink)/22 pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.briefingLabel}
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.briefingNote}
              </p>
            </div>
            <button
              type="button"
              onClick={onShowBriefing}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.settingsWindow.briefingReopen}
            </button>
          </div>

          {/* **La sortie du plateau qui n'est pas une déconnexion** : au téléphone le bandeau ne
              porte pas la manchette, et c'est ici que le dossier de la nation mène. */}
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-2 border-t border-(color:--ink)/22 pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">{fr.settingsWindow.homeLabel}</div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.homeNote}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void navigate({ to: '/accueil' })}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.settingsWindow.home}
            </button>
          </div>

          {/* **Le seul pouvoir de fondateur du plateau**, et il est rangé ici parce qu'une saison
              sans horloge n'a pas d'autre fin. Deux clics, comme la suppression d'une partie :
              c'est la même famille de geste, sauf que rien n'est effacé. */}
          {mayConclude && (
            <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
              <div className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.concludeLabel}
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.concludeNote}
              </p>
              <DestroyButton
                label={fr.settingsWindow.conclude}
                confirm={fr.settingsWindow.concludeConfirm}
                note={fr.settingsWindow.concludeWarning}
                onDestroy={() => void conclude(seat).catch(() => undefined)}
              />
            </div>
          )}

          {/* **Capituler vit à côté de clore**, et pour la même raison : ce sont les deux seules
              sorties d'une saison qu'un joueur décide, et elles prennent le même double clic.
              Une fois le geste fait il n'y a plus de bouton — la capitulation est irréversible,
              et un bouton qui ne rendrait rien serait un bouton qui ment. */}
          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="text-[13.5px] text-[var(--ink)]">
              {fr.settingsWindow.surrenderLabel}
            </div>
            {defeated ? (
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.surrendered}
              </p>
            ) : (
              <>
                <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                  {fr.settingsWindow.surrenderNote}
                </p>
                <DestroyButton
                  label={fr.settingsWindow.surrender}
                  confirm={fr.settingsWindow.surrenderConfirm}
                  note={fr.settingsWindow.surrenderWarning}
                  onDestroy={() => void surrender(seat).catch(() => undefined)}
                />
              </>
            )}
          </div>

          {/* **Se déconnecter n'est pas quitter la partie** (ADR 0022) : la place reste au
              compte, et c'est tout ce qui change avec le jeton de partie — on ferme un
              appareil, on ne rend pas son siège. D'où le clic simple, à côté de deux gestes
              qui, eux, en demandent deux. */}
          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="text-[13.5px] text-[var(--ink)]">{fr.auth.logout}</div>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">{fr.auth.logoutNote}</p>
            <button
              type="button"
              onClick={() =>
                void currentPushEndpoint()
                  .then((endpoint) =>
                    logout({ token: seat.token, ...(endpoint === null ? {} : { endpoint }) }),
                  )
                  .finally(() => {
                    forgetSession();
                    void navigate({ to: '/connexion' });
                  })
              }
              className="mt-[8px] w-full cursor-pointer border border-[var(--ink)] py-[9px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.auth.logout}
            </button>
          </div>

          {/* L'appareil qu'on ne tient plus : il ne doit ni entrer ni sonner. Celui-ci reste —
              son abonnement est nommé au serveur pour être le seul gardé. */}
          <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
            <div className="text-[13.5px] text-[var(--ink)]">{fr.auth.logoutOthers}</div>
            <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
              {closedElsewhere === null
                ? fr.auth.logoutOthersNote
                : fr.auth.logoutOthersDone(closedElsewhere)}
            </p>
            <button
              type="button"
              onClick={() =>
                void currentPushEndpoint()
                  .catch(() => null)
                  .then((endpoint) =>
                    logoutOthers({
                      token: seat.token,
                      ...(endpoint === null ? {} : { endpoint }),
                    }),
                  )
                  .then(({ closed }) => setClosedElsewhere(closed))
                  .catch(() => undefined)
              }
              className="mt-[8px] w-full cursor-pointer border border-[var(--ink)] py-[9px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.auth.logoutOthers}
            </button>
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}

/**
 * Un métier sur un bouton, ou un preset. **Rien n'est jamais grisé** : choisir un métier
 * l'échange avec le bouton qui l'avait, donc aucun de ces neuf clics n'est refusé et les trois
 * lignes montrent toujours une permutation (ADR 0015).
 */
function Chip({ label, marked, onClick }: { label: string; marked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={marked}
      onClick={onClick}
      className={
        marked
          ? 'cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--paper)] uppercase'
          : 'cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]'
      }
    >
      {label}
    </button>
  );
}

const sameMapping = (mapping: MouseMapping, other: MouseMapping): boolean =>
  MOUSE_BUTTONS.every((button: MouseButton) => mapping[button] === other[button]);

function Step({
  sign,
  onClick,
  disabled,
}: {
  sign: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 shrink-0 cursor-pointer border border-[var(--ink)] text-[14px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {sign}
    </button>
  );
}
