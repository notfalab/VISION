import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0014, #060010)",
          borderRadius: 36,
        }}
      >
        <span
          style={{
            fontSize: 120,
            fontWeight: 800,
            background: "linear-gradient(135deg, #a78bfa, #8b5cf6, #7c3aed)",
            backgroundClip: "text",
            color: "#a78bfa",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          V
        </span>
      </div>
    ),
    { ...size }
  );
}
