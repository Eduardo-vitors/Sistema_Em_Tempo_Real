import { useLocation, useNavigate } from "react-router-dom";
import Simulation from "../algorithms/Simulation";

export function SimulationPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { algorithm, horizon, processData } = location.state || {
    algorithm: "rm",
    horizon: 50,
    processData: [],
  };

  return (
    <div className="config-section">
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          marginBottom: "1rem",
          padding: "0.4rem 1rem",
          borderRadius: "999px",
          border: "none",
          backgroundColor: "#e0e0e0",
          alignSelf: "flex-start",
        }}
      >
        ← Voltar
      </button>

      <Simulation
        algorithm={algorithm}
        horizon={horizon}
        processData={processData}
      />
    </div>
  );
}
