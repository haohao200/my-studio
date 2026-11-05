// app/api/captcha/challenge/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const W = 320;
  const H = 160;
  const PIECE_SIZE = 60;
  
  const targetX = Math.floor(Math.random() * (240 - 30 + 1)) + 30;
  const targetY = 50;
  
  // 🎯 核心修改：把正确答案 targetX 和当前时间戳混在一起，转成 Base64 字符串作为 id 传给前端
  const payload = JSON.stringify({ targetX, time: Date.now() });
  const id = Buffer.from(payload).toString('base64');

  const bgSvg = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4f46e5" />
          <stop offset="100%" stop-color="#9333ea" />
        </linearGradient>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g1)" />
      <rect width="${W}" height="${H}" fill="url(#grid)" />
      <text x="${W/2}" y="${H/2 + 10}" font-family="Arial" font-size="24" fill="white" text-anchor="middle" font-weight="bold">奇幻工作室</text>
      <rect x="${targetX}" y="${targetY}" width="${PIECE_SIZE}" height="${PIECE_SIZE}" rx="8" fill="rgba(0,0,0,0.6)" />
    </svg>
  `;

  const puzzleSvg = `
    <svg viewBox="0 0 ${PIECE_SIZE} ${PIECE_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4f46e5" />
          <stop offset="100%" stop-color="#9333ea" />
        </linearGradient>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        </pattern>
      </defs>
      <g transform="translate(-${targetX}, -${targetY})">
        <rect width="${W}" height="${H}" fill="url(#g1)" />
        <rect width="${W}" height="${H}" fill="url(#grid)" />
        <text x="${W/2}" y="${H/2 + 10}" font-family="Arial" font-size="24" fill="white" text-anchor="middle" font-weight="bold">奇幻工作室</text>
      </g>
    </svg>
  `;

  const bgUrl = `data:image/svg+xml;base64,${Buffer.from(bgSvg).toString('base64')}`;
  const puzzleUrl = `data:image/svg+xml;base64,${Buffer.from(puzzleSvg).toString('base64')}`;

  return NextResponse.json({ id, bgUrl, puzzleUrl, bgWidth: W, bgHeight: H });
}