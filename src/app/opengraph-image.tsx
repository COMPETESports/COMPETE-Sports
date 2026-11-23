import { ImageResponse } from 'next/og';

/**
 * The picture shown when joincompete.com is shared in a text or post
 * (Tom, 23 Nov). Without one, iMessage shows a bare grey link card.
 */
export const alt = 'COMPETE Sports — Discover your next event';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0711',
          color: '#f7f2ea',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 900,
            letterSpacing: 4,
            textShadow: '6px 6px 0 #b14aff, 12px 12px 0 #ff7a1a',
          }}
        >
          COMPETE
        </div>
        <div style={{ marginTop: 36, fontSize: 52, color: '#3ef08a', fontWeight: 700 }}>
          Discover your next event.
        </div>
        <div style={{ marginTop: 18, fontSize: 30, color: '#b9aec6' }}>
          Adult volleyball tournaments, leagues and open play
        </div>
      </div>
    ),
    size,
  );
}
