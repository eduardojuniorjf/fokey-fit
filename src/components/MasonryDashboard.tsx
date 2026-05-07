import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export interface MasonryWidget {
  id: string;
  node: ReactNode;
  to?: string;
}

interface Props {
  widgets: MasonryWidget[];
  storageKey?: string;
}

export function MasonryDashboard({ widgets, storageKey = "dashboard-order-v1" }: Props) {
  const defaultIds = useMemo(() => widgets.map((w) => w.id), [widgets]);
  const [order, setOrder] = useState<string[]>(defaultIds);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved: string[] = JSON.parse(raw);
        const known = new Set(saved);
        const merged = [
          ...saved.filter((id) => defaultIds.includes(id)),
          ...defaultIds.filter((id) => !known.has(id)),
        ];
        setOrder(merged);
      }
    } catch { /* noop */ }
    setHydrated(true);
  }, [storageKey, defaultIds]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* noop */ }
  }, [order, storageKey, hydrated]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const widgetMap = useMemo(() => {
    const m = new Map<string, MasonryWidget>();
    widgets.forEach((w) => m.set(w.id, w));
    return m;
  }, [widgets]);

  const sorted = order.filter((id) => widgetMap.has(id));

  function handleDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return prev;
      const next = [...prev];
      next.splice(oldIdx, 1);
      next.splice(newIdx, 0, String(active.id));
      return next;
    });
  }
  function reset() { setOrder(defaultIds); }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Dica:</span> arraste pelo ícone{" "}
          <GripVertical className="inline h-3 w-3" /> (canto superior direito) para reorganizar.
        </p>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
          <RotateCcw className="mr-1.5 h-3 w-3" />
          Restaurar
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={sorted} strategy={rectSortingStrategy}>
          <div className="columns-1 gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
            {sorted.map((id) => {
              const w = widgetMap.get(id)!;
              return (
                <SortableItem key={id} id={id} isOverlay={activeId === id} to={w.to}>
                  {w.node}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeId ? (
            <div className="cursor-grabbing opacity-95 rotate-1 shadow-2xl rounded-xl">
              {widgetMap.get(activeId)?.node}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableItem({
  id, children, isOverlay, to,
}: { id: string; children: ReactNode; isOverlay: boolean; to?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isOverlay ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      {to && (
        <Link
          to={to as never}
          aria-label="Abrir"
          className="absolute inset-0 z-10 rounded-xl focus-visible:ring-2 focus-visible:ring-primary"
        />
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar card"
        className="absolute right-2 top-2 z-20 flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-card/80 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-muted hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className={to ? "transition-transform group-hover:scale-[1.005]" : undefined}>
        {children}
      </div>
    </div>
  );
}
