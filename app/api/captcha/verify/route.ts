// app/api/captcha/verify/route.ts
import { NextResponse } from 'next/server';

// 🎯 配置区
const MAX_DURATION_MS = 3000; // 3秒超时
const TOLERANCE = 15; // 容差 15 像素

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, drag_duration_ms } = body;
    const userX = body.x_position ?? body.xPosition ?? body.x ?? body.position ?? body.offsetX;
    
    const duration = drag_duration_ms || 0;
    const timeStr = (duration / 1000).toFixed(1);

    let targetX = -1;

    try {
      const decoded = Buffer.from(id, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      targetX = payload.targetX;
    } catch (e) {
      return NextResponse.json({ success: true, token: `EXPIRED|0|0|验证数据已损坏，请刷新重试` });
    }

    // 1. 判定超时
    if (duration > MAX_DURATION_MS) {
      return NextResponse.json({ 
        success: true, 
        // 格式: 状态|用时|偏差值|自定义文字
        token: `TIMEOUT|${timeStr}|0|超过 ${MAX_DURATION_MS/1000} 秒限制` 
      });
    }

    // 2. 判定位置，并计算偏左还是偏右
    const diff = Number(userX) - Number(targetX);
    const isMatch = Math.abs(diff) <= TOLERANCE;

    if (isMatch) {
      return NextResponse.json({ 
        success: true, 
        token: `SUCCESS|${timeStr}|0|完美对齐` 
      });
    } else {
      const direction = diff > 0 ? '偏右' : '偏左';
      const absDiff = Math.abs(diff);
      return NextResponse.json({ 
        success: true, 
        token: `WRONG|${timeStr}|${absDiff}|滑块${direction}了 ${absDiff} 像素` 
      });
    }
  } catch (error) {
    return NextResponse.json({ success: false, token: `ERROR|0|0|服务器内部错误` });
  }
}