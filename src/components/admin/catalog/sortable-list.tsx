"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useId, useState, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

function Row({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-2 bg-surface", isDragging && "relative z-10 shadow-pop", className)}>
      <button type="button" {...attributes} {...listeners} className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-sm text-ink-400 hover:bg-canvas hover:text-ink-700 active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Generic drag-and-drop ordering list; persists the new order through the supplied action. */
export function SortableList<T extends { id: string }>({ items, onReorder, render, className, rowClassName }: { items: T[]; onReorder: (ids: string[]) => Promise<ActionState>; render: (item: T) => ReactNode; className?: string; rowClassName?: string }) {
  const [order, setOrder] = useState(items);
  // Stable id keeps dnd-kit's accessibility ids identical between server and client render.
  const dndId = useId();
  const [, startTransition] = useTransition();
  const toast = useToast();
  // Resync when the server sends a new list (e.g. after revalidation) — adjusted during render.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setOrder(items);
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = order.findIndex((item) => item.id === active.id);
        const to = order.findIndex((item) => item.id === over.id);
        const next = arrayMove(order, from, to);
        setOrder(next);
        startTransition(async () => {
          const result = await onReorder(next.map((item) => item.id));
          if (result.status === "error") {
            toast({ title: result.message, tone: "error" });
            setOrder(items);
          }
        });
      }}
    >
      <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {order.map((item) => (
            <Row key={item.id} id={item.id} className={rowClassName}>
              {render(item)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
