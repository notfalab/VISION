"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useWidgetLayoutStore } from "@/stores/widgetLayout";
import SortableItem from "@/components/SortableItem";

interface WidgetEntry {
  id: string;
  node: React.ReactNode;
}

interface SortableWidgetListProps {
  widgets: WidgetEntry[];
}

export default function SortableWidgetList({ widgets }: SortableWidgetListProps) {
  const { widgetOrder, setWidgetOrder } = useWidgetLayoutStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  // Sort widgets by stored order
  const sortedWidgets = [...widgets].sort((a, b) => {
    const aIdx = widgetOrder.indexOf(a.id);
    const bIdx = widgetOrder.indexOf(b.id);
    // Unknown widgets go to end in their original order
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = sortedWidgets.map((w) => w.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(ids, oldIndex, newIndex);
    setWidgetOrder(newOrder);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedWidgets.map((w) => w.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {sortedWidgets.map((widget) => (
            <SortableItem key={widget.id} id={widget.id}>
              {widget.node}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
