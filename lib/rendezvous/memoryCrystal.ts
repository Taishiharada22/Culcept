export type CrystalType = 'warmth' | 'vulnerability' | 'laughter' | 'depth' | 'breakthrough' | 'late_night' | 'first_deep' | 'shared_silence';

export interface Crystal {
  id: string;
  type: CrystalType;
  name: string;
  colorHex: string;
  shape: 'round' | 'faceted' | 'star' | 'drop' | 'spiral';
  messageRange: { start: string; end: string };
  contextSnippet?: string;
}

export interface CrystalVisualConfig {
  color: string;
  shape: string;
  glowColor: string;
  animationPreset: 'glow' | 'pulse' | 'sparkle' | 'rotate' | 'expand' | 'float' | 'shimmer' | 'breathe';
}

interface ChatMessage {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  media_url?: string | null;
}

const CRYSTAL_CONFIG: Record<CrystalType, { name: string; color: string; shape: Crystal['shape']; glowColor: string; animation: CrystalVisualConfig['animationPreset'] }> = {
  warmth: { name: '灯火の記憶', color: '#F59E0B', shape: 'round', glowColor: '#FDE68A', animation: 'glow' },
  vulnerability: { name: '心の扉が開いた夜', color: '#60A5FA', shape: 'drop', glowColor: '#BFDBFE', animation: 'pulse' },
  laughter: { name: '笑い声の結晶', color: '#FBBF24', shape: 'star', glowColor: '#FEF3C7', animation: 'sparkle' },
  depth: { name: '言葉の海の底で', color: '#8B5CF6', shape: 'faceted', glowColor: '#DDD6FE', animation: 'rotate' },
  breakthrough: { name: '新しい扉の向こう側', color: '#34D399', shape: 'spiral', glowColor: '#A7F3D0', animation: 'expand' },
  late_night: { name: '深夜の灯', color: '#6366F1', shape: 'round', glowColor: '#C7D2FE', animation: 'float' },
  first_deep: { name: '最初の深呼吸', color: '#EC4899', shape: 'faceted', glowColor: '#FBCFE8', animation: 'shimmer' },
  shared_silence: { name: '静寂のなかの対話', color: '#94A3B8', shape: 'drop', glowColor: '#E2E8F0', animation: 'breathe' },
};

export function getCrystalVisualConfig(type: CrystalType): CrystalVisualConfig {
  const c = CRYSTAL_CONFIG[type];
  return { color: c.color, shape: c.shape, glowColor: c.glowColor, animationPreset: c.animation };
}

export function detectCrystals(
  messages: ChatMessage[],
  candidateId: string,
  existingCrystals: Crystal[],
): Crystal[] {
  if (messages.length < 5) return [];
  const detected: Crystal[] = [];
  const existingTypes = new Set(existingCrystals.map(c => c.type));

  // Helper: check if crystal type already exists in similar time range
  const isDuplicate = (type: CrystalType, start: string): boolean => {
    if (!existingTypes.has(type)) return false;
    return existingCrystals.some(c => {
      if (c.type !== type) return false;
      const diff = Math.abs(new Date(c.messageRange.start).getTime() - new Date(start).getTime());
      return diff < 24 * 60 * 60 * 1000; // within 24h
    });
  };

  // Late night detection (23:00-4:00, 5+ messages)
  const lateNightMsgs = messages.filter(m => {
    const h = new Date(m.created_at).getHours();
    return h >= 23 || h < 4;
  });
  if (lateNightMsgs.length >= 5 && !isDuplicate('late_night', lateNightMsgs[0].created_at)) {
    const cfg = CRYSTAL_CONFIG.late_night;
    detected.push({
      id: `crystal-${Date.now()}-late_night`,
      type: 'late_night',
      name: cfg.name,
      colorHex: cfg.color,
      shape: cfg.shape,
      messageRange: { start: lateNightMsgs[lateNightMsgs.length - 1].created_at, end: lateNightMsgs[0].created_at },
    });
  }

  // First deep: first time 200+ char messages exchanged
  if (!existingTypes.has('first_deep')) {
    const deepMsg = messages.find(m => m.body && m.body.length >= 200);
    if (deepMsg) {
      const cfg = CRYSTAL_CONFIG.first_deep;
      detected.push({
        id: `crystal-${Date.now()}-first_deep`,
        type: 'first_deep',
        name: cfg.name,
        colorHex: cfg.color,
        shape: cfg.shape,
        messageRange: { start: deepMsg.created_at, end: deepMsg.created_at },
      });
    }
  }

  // Vulnerability: emotional keywords
  const emotionalKeywords = ['不安', '怖い', '本当は', '実は', '正直に言うと', '言えなかった', '辛い', '寂しい', '弱い'];
  const vulnMsgs = messages.filter(m => emotionalKeywords.some(k => m.body?.includes(k)));
  if (vulnMsgs.length >= 2 && !isDuplicate('vulnerability', vulnMsgs[0].created_at)) {
    const cfg = CRYSTAL_CONFIG.vulnerability;
    detected.push({
      id: `crystal-${Date.now()}-vulnerability`,
      type: 'vulnerability',
      name: cfg.name,
      colorHex: cfg.color,
      shape: cfg.shape,
      messageRange: { start: vulnMsgs[vulnMsgs.length - 1].created_at, end: vulnMsgs[0].created_at },
    });
  }

  // Laughter: laugh reactions concentrated
  const laughKeywords = ['笑', 'ｗ', 'www', '😂', '🤣', 'ﾜﾛﾀ', 'ワロタ', 'おもしろ'];
  const laughMsgs = messages.filter(m => laughKeywords.some(k => m.body?.includes(k)));
  if (laughMsgs.length >= 4 && !isDuplicate('laughter', laughMsgs[0].created_at)) {
    const cfg = CRYSTAL_CONFIG.laughter;
    detected.push({
      id: `crystal-${Date.now()}-laughter`,
      type: 'laughter',
      name: cfg.name,
      colorHex: cfg.color,
      shape: cfg.shape,
      messageRange: { start: laughMsgs[laughMsgs.length - 1].created_at, end: laughMsgs[0].created_at },
    });
  }

  // Warmth: positive/gratitude keywords
  const warmKeywords = ['ありがとう', '嬉しい', '感謝', '素敵', '大好き', '安心', '心地よい', '幸せ'];
  const warmMsgs = messages.filter(m => warmKeywords.some(k => m.body?.includes(k)));
  if (warmMsgs.length >= 3 && !isDuplicate('warmth', warmMsgs[0].created_at)) {
    const cfg = CRYSTAL_CONFIG.warmth;
    detected.push({
      id: `crystal-${Date.now()}-warmth`,
      type: 'warmth',
      name: cfg.name,
      colorHex: cfg.color,
      shape: cfg.shape,
      messageRange: { start: warmMsgs[warmMsgs.length - 1].created_at, end: warmMsgs[0].created_at },
    });
  }

  // Depth: 10+ consecutive messages averaging 200+ chars
  if (!isDuplicate('depth', messages[0]?.created_at || '')) {
    for (let i = 0; i <= messages.length - 10; i++) {
      const window = messages.slice(i, i + 10);
      const avgLen = window.reduce((s, m) => s + (m.body?.length || 0), 0) / 10;
      if (avgLen >= 200) {
        const cfg = CRYSTAL_CONFIG.depth;
        detected.push({
          id: `crystal-${Date.now()}-depth`,
          type: 'depth',
          name: cfg.name,
          colorHex: cfg.color,
          shape: cfg.shape,
          messageRange: { start: window[window.length - 1].created_at, end: window[0].created_at },
        });
        break;
      }
    }
  }

  // Breakthrough: first media or URL share
  if (!existingTypes.has('breakthrough')) {
    const mediaMsg = messages.find(m => m.media_url || (m.body && /https?:\/\//.test(m.body)));
    if (mediaMsg) {
      const cfg = CRYSTAL_CONFIG.breakthrough;
      detected.push({
        id: `crystal-${Date.now()}-breakthrough`,
        type: 'breakthrough',
        name: cfg.name,
        colorHex: cfg.color,
        shape: cfg.shape,
        messageRange: { start: mediaMsg.created_at, end: mediaMsg.created_at },
      });
    }
  }

  return detected;
}
