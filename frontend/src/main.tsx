import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AccountPage, LoginPage, RegisterPage } from "@/components/account/account-pages";
import { LearningApp } from "@/components/learning/learning-app";
import "@/src/globals.css";

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function AppRoute() {
  const path = normalizePath(window.location.pathname);

  switch (path) {
    case "/login":
      return <LoginPage />;
    case "/register":
      return <RegisterPage />;
    case "/account":
      return <AccountPage />;
    case "/vocabulary":
      return <LearningApp initialModule="words" />;
    case "/grammar":
      return <LearningApp initialModule="grammar" />;
    case "/reading":
      return <LearningApp initialModule="reading" />;
    case "/mistakes":
      return <LearningApp initialModule="mistakes" />;
    case "/parent":
      return <LearningApp initialModule="parent" />;
    case "/admin/vocabulary":
      return <LearningApp initialModule="admin" />;
    case "/practice/daily":
      return <LearningApp initialModule="daily" autoStartPractice="daily" />;
    case "/practice/words":
      return <LearningApp initialModule="words" autoStartPractice="words" />;
    case "/practice/spelling":
      return <LearningApp initialModule="words" autoStartPractice="spelling" />;
    case "/practice/grammar":
      return <LearningApp initialModule="grammar" autoStartPractice="grammar" />;
    case "/practice/reading":
      return <LearningApp initialModule="reading" autoStartPractice="reading" />;
    case "/practice/mistakes":
      return <LearningApp initialModule="mistakes" autoStartPractice="mistakes" />;
    case "/":
      return <LearningApp initialModule="daily" />;
    default:
      return <LearningApp initialModule="daily" />;
  }
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <AppRoute />
  </StrictMode>,
);
