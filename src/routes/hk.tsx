import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/hk")({ component: HkRedirect });

function HkRedirect() {
  return <Navigate to="/queue" replace />;
}
