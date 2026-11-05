// app/api/captcha/verify/route.ts
import { NextResponse } from 'next/server';

// 🎯 配置区
const MAX_DURATION_MS = 5000; // 超时限制：5秒 (线上网络有延迟，建议放宽到5秒)
const TOLERANCE = 15; // 容差 15 像素

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, drag_duration_ms } = body;
    const userX = body.x_position ?? body.xPosition ?? body.x ?? body.position ?? body.offsetX;
    
    const duration = drag_duration_ms || 0;
    const timeStr = (duration / 1000).toFixed(1);

    let targetX = -1;
    let generateTime = 0;

    // 🎯 核心修改：从前端传回来的 id 中，解开 Base64，提取答案
    try {
      const decoded = Buffer.from(id, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      targetX = payload.targetX;
      generateTime = payload.time;
    } catch (e) {
      return NextResponse.json({ success: true, token: `EXPIRED|0|验证数据已损坏` });
    }

    // 1. 判定超时
    if (duration > MAX_DURATION_MS) {
      return NextResponse.json({ 
        success: true, 
        token: `TIMEOUT|${timeStr}|滑动超时` 
      });
    }

    // 2. 判定位置
    const isMatch = Math.abs(Number(userX) - Number(targetX)) <= TOLERANCE;

    if (isMatch) {
      return NextResponse.json({ 
        success: true, 
        token: `SUCCESS|${timeStr}|验证通过` 
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        token: `WRONG|${timeStr}|位置不对` 
      });
    }
  } catch (error) {
    return NextResponse.json({ success: false, token: `ERROR|0|服务器错误` });
  }
}