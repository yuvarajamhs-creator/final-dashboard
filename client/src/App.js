import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import Home from "./pages/Home";
import Task from "./pages/Operations/Task";
import Report from "./pages/Reports/Report";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Sidebar from "./components/Sidebar"
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import AdsDashboard_OptionA from "./pages/Dashboards";
import BestPerformingAd from "./pages/BestPerformingAd";
import BestPerformingReel from "./pages/BestPerformingReel";
import Plan from "./pages/Plan";
import Audience from "./pages/Audience";
import AIInsights from "./pages/AIInsights";
import HighFiveLanding from "./pages/HighFiveLanding";
import MetaSettings from "./pages/MetaSettings";
import TeamManagement from "./pages/TeamManagement";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Sidebar>
                <Routes>
                  <Route path="/" element={<AdsDashboard_OptionA />} />
                  <Route path="/best-ad" element={<BestPerformingAd />} />
                  <Route path="/best-reel" element={<BestPerformingReel />} />
                  <Route path="/plan" element={<Plan />} />
                  <Route path="/audience" element={<Audience />} />
                  <Route path="/ai-insights" element={<AIInsights />} />
                  <Route path="/operation/task" element={<Task />} />
                  <Route path="/report/daily" element={<Report />} />
                  <Route path="/high-five" element={<HighFiveLanding />} />
                  <Route path="/meta-settings" element={<MetaSettings />} />
                  <Route path="/team-management" element={<TeamManagement />} />
                </Routes>
              </Sidebar>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
