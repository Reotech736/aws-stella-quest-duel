import { createBrowserRouter, Navigate } from "react-router-dom";

import { GamePage } from "./GamePage";
import { HomePage } from "./HomePage";
import { LoginPage } from "./LoginPage";
import { AnonymousOnly, ProtectedRoutes } from "./RouteGuard";
import { WaitingRoomPage } from "./WaitingRoomPage";

export const router = createBrowserRouter([
  {
    element: <AnonymousOnly />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoutes />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/rooms/:roomId", element: <WaitingRoomPage /> },
      { path: "/games/:gameId", element: <GamePage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
