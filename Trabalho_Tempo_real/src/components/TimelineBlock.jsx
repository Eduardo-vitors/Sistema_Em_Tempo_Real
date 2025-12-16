import "../algorithms/style.css";

/**
 * Um bloco da linha do tempo.
 * - state: exe, wait, idle, end, miss, future
 * - index: instante de tempo
 * - majorTime: tempo atual (cursor)
 */
export default function TimelineBlock({ state, index, majorTime }) {
  const isPastOrPresent = index <= majorTime;
  const effectiveState = isPastOrPresent ? state : "future";

  let className = "timeline-block";

  if (effectiveState === "exe") className += " exe";
  else if (effectiveState === "wait") className += " wait";
  else if (effectiveState === "over") className += " over";
  else if (effectiveState === "idle") className += " idle";
  else if (effectiveState === "end") className += " end";
  else if (effectiveState === "miss") className += " miss";
  else if (effectiveState === "future") className += " future";

  return (
    <div className={className}>
      <p>{index}</p>
    </div>
  );
}
