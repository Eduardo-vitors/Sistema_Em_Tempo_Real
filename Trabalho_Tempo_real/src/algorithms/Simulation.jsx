import { useEffect, useState, useRef } from "react";
import TimelineBlock from "../components/TimelineBlock";
import { IoMdPlay, IoMdPause } from "react-icons/io";
import { MdSkipPrevious, MdSkipNext } from "react-icons/md";
import { RiResetLeftFill } from "react-icons/ri";
import { AiFillThunderbolt } from "react-icons/ai";

import "./style.css";

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, n));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

function computeHyperperiod(tasks) {
  const Ts = tasks.map((t) => clampInt(t.periodo ?? 1, 1, 10_000));
  return Ts.reduce((acc, cur) => lcm(acc, cur), 1);
}

function pickJob(readyJobs, algorithm, tasks) {
  if (readyJobs.length === 0) return null;

  if (algorithm === "rm") {
    // menor T => maior prioridade (fixa)
    return readyJobs
      .slice()
      .sort((a, b) => {
        const Ta = tasks.get(a.taskId).periodo;
        const Tb = tasks.get(b.taskId).periodo;
        if (Ta !== Tb) return Ta - Tb;
        // desempate determinístico
        if (a.release !== b.release) return a.release - b.release;
        return a.taskId - b.taskId;
      })[0];
  }

  // EDF: menor deadline absoluto primeiro
  return readyJobs
    .slice()
    .sort((a, b) => {
      if (a.deadlineAbs !== b.deadlineAbs) return a.deadlineAbs - b.deadlineAbs;
      if (a.release !== b.release) return a.release - b.release;
      return a.taskId - b.taskId;
    })[0];
}

/**
 * Simulador de eventos discretos para um conjunto de tarefas periódicas.
 * Saída: Gantt por tarefa (blocos por unidade de tempo), usando TimelineBlock.
 */
export default function Simulation({ algorithm, processData, horizon = 50 }) {
  const [simulationData, setSimulationData] = useState([]);
  const moment = useRef(0);
  const lastTick = useRef(Date.now());
  const [majorTime, setMajorTime] = useState(0);
  const [minorTime, setMinorTime] = useState(0);
  const [finalTime, setFinalTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [simulationState, setSimulationState] = useState("paused");

  // clock visual (mesmo esquema do seu projeto original)
  useEffect(() => {
    const interval = setInterval(() => {
      if (finalTime === majorTime) setSimulationState("paused");
      if (simulationState !== "running") return;

      moment.current += ((Date.now() - lastTick.current) * speed) / 1000;
      lastTick.current = Date.now();

      const mj = Math.floor(moment.current);
      setMinorTime(moment.current - mj);

      if (mj !== majorTime) setMajorTime(mj);
    }, 50);

    return () => clearInterval(interval);
  }, [finalTime, majorTime, simulationState, speed]);

  // simulação em si
  useEffect(() => {
    const H = clampInt(horizon, 1, 10_000);

    // normaliza/copias (não mutar o state externo)
    const tasksArr = (processData ?? []).map((t, i) => {
      const T = clampInt(t.periodo ?? 1, 1, 10_000);
      const C = clampInt(t.tempo ?? 1, 1, 10_000);
      const offset = clampInt(t.chegada ?? 0, 0, 10_000);
      const Draw = clampInt(t.deadline ?? 0, 0, 10_000);
      const D = Draw === 0 ? T : Draw;

      return {
        id: t.id ?? i + 1,
        chegada: offset,
        tempo: C,
        periodo: T,
        deadline: D,
        timeline: Array(H).fill("idle"),
      };
    });

    const tasks = new Map(tasksArr.map((t) => [t.id, t]));

    // Se o usuário deixou horizon muito pequeno, tudo bem.
    // Se quiser um padrão melhor, dá pra usar hiperperíodo:
    // const hp = computeHyperperiod(tasksArr);

    // Próxima liberação (release) de cada tarefa
    const nextRelease = new Map();
    tasksArr.forEach((t) => nextRelease.set(t.id, t.chegada));

    /**
     * Jobs prontos (fila global).
     * Cada job:
     *  - taskId
     *  - remaining
     *  - release
     *  - deadlineAbs
     */
    let ready = [];
    let running = null;

    // pequeno helper: marca estados em um intervalo [t0, t1)
    function fillInterval(t0, t1, runningJob, readyJobs) {
      for (let t = t0; t < t1 && t < H; t++) {
        // calcula se existe algum job vencido por tarefa
        const overdueByTask = new Set(
          readyJobs
            .filter((j) => j.deadlineAbs <= t && j.remaining > 0)
            .map((j) => j.taskId)
        );
        if (runningJob && runningJob.deadlineAbs <= t && runningJob.remaining > 0) {
          overdueByTask.add(runningJob.taskId);
        }

        tasksArr.forEach((task) => {
          const isRunning = runningJob && runningJob.taskId === task.id;
          const hasPending = readyJobs.some((j) => j.taskId === task.id);
          const notReleasedYet = t < task.chegada;

          let state = "idle";
          if (notReleasedYet) state = "idle";
          else if (isRunning) state = "exe";
          else if (hasPending) state = "wait";
          else state = "idle";

          // se há atraso de deadline, destaca como 'miss'
          if (overdueByTask.has(task.id) && !isRunning) state = "miss";
          if (overdueByTask.has(task.id) && isRunning) state = "miss"; // enfatiza também quando roda atrasado

          task.timeline[t] = state;
        });
      }
    }

    // Simulador de eventos discretos:
    // - libera todos os jobs no tempo t
    // - escolhe o job (RM/EDF)
    // - avança até o próximo evento (novo release ou término)
    let time = 0;

    while (time < H) {
      // 1) Releases em `time`
      tasksArr.forEach((task) => {
        const nr = nextRelease.get(task.id);
        if (nr === time) {
          ready.push({
            taskId: task.id,
            remaining: task.tempo,
            release: time,
            deadlineAbs: time + task.deadline,
          });
          nextRelease.set(task.id, time + task.periodo);
        }
      });

      // 2) Reavalia quem roda (preemptivo)
      const chosen = pickJob(ready, algorithm, tasks);
      if (chosen !== running) {
        running = chosen;
      }

      // 3) Descobre próximo evento
      const nextRel = Math.min(
        ...Array.from(nextRelease.values()).filter((v) => v > time)
      );
      const finish = running ? time + running.remaining : Infinity;
      const tNext = Math.min(nextRel ?? Infinity, finish, H);

      // Se não há nada pronto e o próximo release é no futuro, pula direto
      if (!running && ready.length === 0) {
        const jumpTo = Number.isFinite(nextRel) ? Math.min(nextRel, H) : H;
        fillInterval(time, jumpTo, null, ready);
        time = jumpTo;
        continue;
      }

      // 4) Preenche o Gantt do intervalo e "consome" execução
      fillInterval(time, tNext, running, ready);

      if (running) {
        const delta = tNext - time;
        running.remaining -= delta;
        if (running.remaining <= 0) {
          // remove esse job da fila
          ready = ready.filter((j) => j !== running);
          running = null;
        }
      }

      time = tNext;
    }

    setSimulationData(tasksArr);
    setFinalTime(H);
    moment.current = 0;
    setMajorTime(0);
    setMinorTime(0);
    setSimulationState("paused");
  }, [algorithm, processData, horizon]);

  function getAVGUtilization(time) {
    // Mede % de tarefas executando (exe/miss) por instante, média simples.
    // Não é a métrica "clássica" de STR, mas dá um indicador rápido.
    let exec = 0;
    let total = 0;

    simulationData.forEach((t) => {
      for (let i = 0; i < time && i < t.timeline.length; i++) {
        total++;
        if (["exe", "miss"].includes(t.timeline[i])) exec++;
      }
    });

    return total === 0 ? 0 : (exec / total) * 100;
  }

  function getStatus(task, time) {
    const index = minorTime === 0 ? time - 1 : time;
    if (index < 0) return "";
    if (index >= finalTime) return "Finalizado";

    switch (task.timeline[index]) {
      case "exe":
        return "Executando";
      case "wait":
        return "Pronto";
      case "miss":
        return "Deadline Miss";
      case "idle":
        return "Ocioso";
      default:
        return "";
    }
  }

  const algoLabel = algorithm === "rm" ? "RM" : "EDF";

  return (
    <>
      <div className="simulation-header">
        <h3>Simulação {algoLabel} (tempo 0 → {finalTime})</h3>
      </div>

      <div className="simulation-controls">
        <button
          className="simulation-controller-button"
          onClick={() => {
            moment.current = 0;
            setMajorTime(0);
            setMinorTime(0);
            setSimulationState("paused");
          }}
        >
          <RiResetLeftFill size={32} />
        </button>

        <button
          className="simulation-controller-button"
          disabled={simulationState !== "paused" || majorTime === 0}
          onClick={() => {
            moment.current = majorTime - 1;
            setMajorTime(majorTime - 1);
            setMinorTime(0);
          }}
        >
          <MdSkipPrevious size={32} />
        </button>

        <button
          className="simulation-controller-button"
          disabled={majorTime === finalTime}
          onClick={() => {
            if (simulationState === "running") setSimulationState("paused");
            else {
              lastTick.current = Date.now();
              setSimulationState("running");
            }
          }}
        >
          {simulationState !== "running" && <IoMdPlay size={32} />}
          {simulationState !== "paused" && <IoMdPause size={32} />}
        </button>

        <button
          className="simulation-controller-button"
          disabled={simulationState !== "paused" || majorTime === finalTime}
          onClick={() => {
            moment.current = majorTime + 1;
            setMajorTime(majorTime + 1);
            setMinorTime(0);
          }}
        >
          <MdSkipNext size={32} />
        </button>

        <button
          className="simulation-controller-button"
          onClick={() => {
            moment.current = finalTime;
            setMajorTime(finalTime);
            setMinorTime(0);
            setSimulationState("paused");
          }}
        >
          <AiFillThunderbolt size={32} />
        </button>
      </div>

      <div className="simulation-speed">
        <div>
          <input
            disabled={simulationState !== "paused"}
            type="range"
            min="0.1"
            max="4"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <label>Clock Speed: {Number(speed).toFixed(1)}</label>
        </div>

        <span>Tempo: {majorTime}</span>
      </div>

      <div className="simulation-container">
        {simulationData.map((t) => (
          <div key={t.id} className="process-row">
            <h4>
              <strong>Tarefa {t.id}</strong>
              <br />
              {getStatus(t, majorTime)}
              <br />
              <span style={{ fontWeight: 400, opacity: 0.85 }}>
                C={t.tempo} T={t.periodo} D={t.deadline} offset={t.chegada}
              </span>
            </h4>

            <div className="process-timeline">
              {t.timeline.map((state, i) => (
                <TimelineBlock key={i} state={state} index={i} majorTime={majorTime} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="turnaround-info">
        <h4>Indicador (média de execução): {getAVGUtilization(majorTime).toFixed(1)}%</h4>
      </div>
    </>
  );
}
