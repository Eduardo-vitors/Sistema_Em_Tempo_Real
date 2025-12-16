import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="config-section">
      <h2>Página não encontrada</h2>
      <p style={{ marginTop: "1rem" }}>
        Voltar para a <Link to="/">página inicial</Link>.
      </p>
    </div>
  );
}
