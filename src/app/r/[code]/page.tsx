import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomLoader, RoomLoading } from "@/components/room/room-loader";

export const metadata: Metadata = {
  title: "Join a Unison room",
  description: "You're invited to play Unison — different minds, one word.",
  robots: { index: false },
};

export default function RoomPage() {
  return (
    <Suspense fallback={<RoomLoading />}>
      <RoomLoader />
    </Suspense>
  );
}
