import Header from "../components/Header";
import "../App.css";
import { Outlet } from "react-router-dom";

export function DefaultLayout() {
  return (
    <div className="app-container">
      <header className="header-content">
        <Header />
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="footer">
        <p style={{ marginBottom: "1rem" }}>MATA58-SISTEMAS OPERACIONAIS</p>
      </footer>
    </div>
  );
}
