// Cards side by side without empty space inside them. A grid row is as tall as its tallest card, so a card with little
// to say (one sport, a short text) was stretched and stood half empty next to a long one. Here each side is a column
// of its own: on a wide screen two independent stacks, every card as tall as its content, the next card moves up.
// Below lg one column, in reading order: left 1, right 1, left 2, right 2 ... (`display: contents` lets the cards of
// both sides share one flex column, where `order` interleaves them).
//
//   <Columns left={[<Readiness />, <Plan />]} right={[<Load />, <Upcoming />]} />
//
// Leave out a card with null or false; with one side empty the other takes the full width.

type Node = React.ReactNode;

export default function Columns({ left, right, template = "lg:grid-cols-[1.25fr_1fr]", className = "" }: { left: Node[]; right: Node[]; template?: string; className?: string }) {
  const l = left.filter((n) => n != null && n !== false);
  const r = right.filter((n) => n != null && n !== false);
  const both = l.length > 0 && r.length > 0;
  const side = (items: Node[], offset: number) => (
    <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
      {items.map((n, i) => (
        <div key={i} className="min-w-0" style={{ order: both ? i * 2 + offset : i }}>
          {n}
        </div>
      ))}
    </div>
  );
  return (
    <div className={`flex flex-col gap-4 ${both ? `lg:grid lg:items-start ${template}` : ""} ${className}`}>
      {side(l, 0)}
      {side(r, 1)}
    </div>
  );
}
