import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { watchSystemTheme } from "./lib/theme";
import Home from "./pages/Home";

const WorkspacePage = lazy(() => import("./pages/Workspace"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Drafts = lazy(() => import("./pages/Drafts"));
const DraftPage = lazy(() => import("./pages/DraftPage"));
const Decisions = lazy(() => import("./pages/Decisions"));
const Settings = lazy(() => import("./pages/Settings"));

function NotFound() {
  return <div className="p-10 text-center text-sm text-muted">That page doesn't exist.</div>;
}

export default function App() {
  useEffect(() => watchSystemTheme(), []);
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="w/:id" element={<WorkspacePage />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="drafts" element={<Drafts />} />
          <Route path="drafts/:id" element={<DraftPage />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
