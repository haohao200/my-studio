// app/api/captcha/verify/route.ts
import { NextResponse } from 'next/server';

// ====================================================
// 🎯 验证配置区 (你可以随时修改这里的数字)
// ====================================================
// 限制的滑动时间（单位：毫秒），3000 毫秒 = 3 秒
const MAX_DURATION_MS = 1500; 

// 允许的像素误差范围（正负多少像素内算对齐）
const TOLERANCE = 15; 
// ====================================================

const globalForChallenges = global as unknown as { challenges: Map<string, { targetX: number }> };
const challenges = globalForChallenges.challenges || new Map();
if (process.env.NODE_ENV !== 'production') globalForChallenges.challenges = challenges;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, drag_duration_ms } = body;
    const userX = body.x_position ?? body.xPosition ?? body.x ?? body.position ?? body.offsetX;
    
    const duration = drag_duration_ms || 0;
    const timeStr = (duration / 1000).toFixed(1);

    const challenge = challenges.get(id);
    if (!challenge) {
      return NextResponse.json({ success: true, token: `EXPIRED|0|验证已过期` });
    }

    // 1. 判定超时（使用顶部的配置参数）
    if (duration > MAX_DURATION_MS) {
      challenges.delete(id);
      return NextResponse.json({ 
        success: true, 
        token: `TIMEOUT|${timeStr}|滑动超时` 
      });
    }

    // 2. 判定位置（使用顶部的配置参数）
    const isMatch = Math.abs(Number(userX) - Number(challenge.targetX)) <= TOLERANCE;

    if (isMatch) {
      challenges.delete(id);
      return NextResponse.json({ 
        success: true, 
        token: `SUCCESS|${timeStr}|验证通过` 
      });
    } else {
      challenges.delete(id);
      return NextResponse.json({ 
        success: true, 
        token: `WRONG|${timeStr}|位置不对` 
      });
    }
  } catch (error) {
    return NextResponse.json({ success: false, token: `ERROR|0|服务器错误` });
  }
}