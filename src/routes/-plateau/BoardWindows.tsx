import { lazy, Suspense, type ComponentProps } from 'react';
import type { Telegraph } from '@/data/telegraph';
import type { Seat } from '@/data/session';
import type { EndingFacts } from '@/domain/ending';
import type { PlayerView } from '@/domain/player-view';
import type { BoardWindow } from './board-search';

const JournalWindow = lazy(() =>
  import('./JournalWindow').then((module) => ({ default: module.JournalWindow })),
);
const SiteModal = lazy(() =>
  import('./SiteModal').then((module) => ({ default: module.SiteModal })),
);
const NationWindow = lazy(() =>
  import('./NationWindow').then((module) => ({ default: module.NationWindow })),
);
const SettingsWindow = lazy(() =>
  import('./SettingsWindow').then((module) => ({ default: module.SettingsWindow })),
);
const TelegraphWindow = lazy(() =>
  import('./TelegraphWindow').then((module) => ({ default: module.TelegraphWindow })),
);
const GunneryWindow = lazy(() =>
  import('./GunneryWindow').then((module) => ({ default: module.GunneryWindow })),
);
const ResearchWindow = lazy(() =>
  import('./ResearchWindow').then((module) => ({ default: module.ResearchWindow })),
);
const PressWindow = lazy(() =>
  import('./PressWindow').then((module) => ({ default: module.PressWindow })),
);

type SurfaceName = Exclude<BoardWindow, 'personalBoard'>;
type Journal = ComponentProps<typeof JournalWindow>;

/** **La pile des fenêtres de la colonne**, chacune dans sa propre frontière de chargement. */
export function BoardWindows({
  surfaces,
  view,
  seat,
  telegraph,
  theatre,
  ending,
  blitz,
  focused,
  journalLead,
  rumors,
  selectedRumorId,
  onSelectRumor,
  garrisonAt,
  onShowCombat,
  onLocate,
  onOpenGarrison,
  onOpenWindow,
  onPrepare,
  onLocateStation,
  onShowBriefing,
  onBringForward,
  onClose,
}: {
  surfaces: ReadonlyArray<SurfaceName>;
  view: PlayerView;
  seat: Seat;
  telegraph: Telegraph;
  theatre: ComponentProps<typeof GunneryWindow>['theatre'];
  ending: EndingFacts;
  blitz: boolean;
  focused: string | undefined;
  journalLead: string | null;
  rumors: Journal['rumors'];
  selectedRumorId: Journal['selectedRumorId'];
  onSelectRumor: Journal['onSelectRumor'];
  garrisonAt: Journal['garrisonAt'];
  onShowCombat: Journal['onShowCombat'];
  onLocate: Journal['onLocate'];
  onOpenGarrison: Journal['onOpenGarrison'];
  onOpenWindow: (name: BoardWindow) => void;
  onPrepare: ComponentProps<typeof SiteModal>['onPrepare'];
  onLocateStation: ComponentProps<typeof NationWindow>['onLocate'];
  onShowBriefing: () => void;
  onBringForward: (name: BoardWindow) => void;
  onClose: (name: BoardWindow) => void;
}) {
  const surface = (name: SurfaceName, rank: number) => {
    const windowProps = {
      rank,
      inFront: rank === surfaces.length - 1,
      onBringForward: () => onBringForward(name),
      onClose: () => onClose(name),
    };
    switch (name) {
      case 'journal':
        return (
          <JournalWindow
            key={name}
            view={view}
            seat={seat}
            leadReport={journalLead}
            rumors={rumors}
            selectedRumorId={selectedRumorId}
            onSelectRumor={onSelectRumor}
            garrisonAt={garrisonAt}
            onShowCombat={onShowCombat}
            onLocate={onLocate}
            onOpenGarrison={onOpenGarrison}
            {...windowProps}
          />
        );
      case 'telegraph':
        return <TelegraphWindow key={name} telegraph={telegraph} seat={seat} {...windowProps} />;
      case 'site':
        /** Sans bâtiment nommé il n'y a pas de site : l'URL a perdu son ancre, et une
         *  modale sans sujet n'est pas une modale vide, c'est rien du tout. */
        return focused === undefined ? null : (
          <SiteModal
            key={name}
            view={view}
            seat={seat}
            buildingId={focused}
            onOpenGunnery={() => onOpenWindow('gunnery')}
            onPrepare={onPrepare}
            {...windowProps}
          />
        );
      case 'nation':
        return <NationWindow key={name} view={view} onLocate={onLocateStation} {...windowProps} />;
      case 'gunnery':
        return <GunneryWindow key={name} seat={seat} theatre={theatre} {...windowProps} />;
      case 'press':
        return (
          <PressWindow
            key={name}
            press={view.press}
            verdict={view.season.verdict}
            ending={ending}
            blitz={blitz}
            points={view.strategicPoints}
            race={view.season.race}
            {...windowProps}
          />
        );
      case 'research':
        return <ResearchWindow key={name} view={view} seat={seat} {...windowProps} />;
      case 'settings':
        return (
          <SettingsWindow
            key={name}
            seat={seat}
            mayConclude={view.me.mayConclude}
            defeated={view.me.defeated}
            blitz={blitz}
            onShowBriefing={onShowBriefing}
            {...windowProps}
          />
        );
    }
  };

  return (
    <>
      {surfaces.map((name, rank) => (
        <Suspense key={name} fallback={null}>
          {surface(name, rank)}
        </Suspense>
      ))}
    </>
  );
}
