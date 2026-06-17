export interface LiveReviewInput {
  session: {
    live_id: string;
    live_title: string;
    live_category?: string;
    planned_gmv: number;
    planned_peak_online: number;
    planned_conversion_rate: number;
    planned_duration_minutes: number;
    actual_gmv: number;
    actual_peak_online: number;
    actual_duration_minutes: number;
  };
  funnel: {
    exposure: number;
    viewers: number;
    productClicks: number;
    orders: number;
    buyers: number;
  };
  products: LiveReviewProductInput[];
  anchor?: {
    anchor_id: string;
    anchor_name: string;
    conversion_rate: number;
    average_watch_time: number;
    interaction_rate: number;
    script_execution_score: number;
    performance_score: number;
  } | null;
  interactions: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    purchaseIntent: number;
  };
}

export interface LiveReviewProductInput {
  product_id: string;
  product_name: string;
  category?: string;
  sales_volume: number;
  gmv: number;
  click_rate: number;
  conversion_rate: number;
  refund_rate: number;
  interaction_heat: number;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function rate(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return round((part / total) * 100);
}

function achievement(actual: number, planned: number) {
  if (!planned || planned <= 0) return actual > 0 ? 100 : 0;
  return round(Math.min((actual / planned) * 100, 150));
}

function grade(score: number) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  return 'C';
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, round(value)));
}

export function buildLiveReviewAnalysis(input: LiveReviewInput) {
  const core = {
    plannedGmv: round(input.session.planned_gmv),
    actualGmv: round(input.session.actual_gmv),
    gmvAchievement: achievement(input.session.actual_gmv, input.session.planned_gmv),
    plannedPeakOnline: round(input.session.planned_peak_online),
    actualPeakOnline: round(input.session.actual_peak_online),
    trafficAchievement: achievement(input.session.actual_peak_online, input.session.planned_peak_online),
    plannedDurationMinutes: round(input.session.planned_duration_minutes),
    actualDurationMinutes: round(input.session.actual_duration_minutes),
    durationAchievement: achievement(input.session.actual_duration_minutes, input.session.planned_duration_minutes),
    plannedConversionRate: round(input.session.planned_conversion_rate),
    actualConversionRate: rate(input.funnel.orders, input.funnel.viewers),
  };

  const funnel = {
    exposure: input.funnel.exposure,
    viewers: input.funnel.viewers,
    productClicks: input.funnel.productClicks,
    orders: input.funnel.orders,
    buyers: input.funnel.buyers,
    viewRate: rate(input.funnel.viewers, input.funnel.exposure),
    clickRate: rate(input.funnel.productClicks, input.funnel.viewers),
    orderConversionRate: rate(input.funnel.orders, input.funnel.productClicks),
    buyerConversionRate: rate(input.funnel.buyers, input.funnel.productClicks),
    overallConversionRate: rate(input.funnel.orders, input.funnel.viewers),
  };

  const totalProductGmv = input.products.reduce((sum, product) => sum + product.gmv, 0);
  const rankedProducts = input.products
    .map((product) => ({
      ...product,
      gmv: round(product.gmv),
      contributionRate: rate(product.gmv, totalProductGmv),
      role: product.gmv >= totalProductGmv * 0.35 ? '核心贡献' : product.gmv <= totalProductGmv * 0.12 ? '长尾观察' : '稳定补充',
    }))
    .sort((a, b) => b.gmv - a.gmv);

  const topProducts = rankedProducts.slice(0, 3);
  const longTailProducts = rankedProducts
    .filter((product) => product.role === '长尾观察' || product.conversion_rate < 2 || product.refund_rate > 5)
    .slice(0, 5);

  const anchor = input.anchor
    ? {
        ...input.anchor,
        conversion_rate: round(input.anchor.conversion_rate),
        average_watch_time: round(input.anchor.average_watch_time),
        interaction_rate: round(input.anchor.interaction_rate),
        script_execution_score: round(input.anchor.script_execution_score),
        performance_score: round(input.anchor.performance_score),
        conclusion: input.anchor.performance_score >= 85
          ? '主播控场稳定，可继续承接主推品节奏。'
          : '主播表现仍有提升空间，需要加强节奏控制和卖点转化。',
      }
    : {
        anchor_id: '',
        anchor_name: '未记录',
        conversion_rate: 0,
        average_watch_time: 0,
        interaction_rate: 0,
        script_execution_score: 0,
        performance_score: 0,
        conclusion: '缺少主播过程评价数据，建议补充控场、话术执行、互动引导记录。',
      };

  const sentimentTotal = input.interactions.positive + input.interactions.neutral + input.interactions.negative;
  const sentiment = {
    positiveRate: rate(input.interactions.positive, sentimentTotal),
    neutralRate: rate(input.interactions.neutral, sentimentTotal),
    negativeRate: rate(input.interactions.negative, sentimentTotal),
    purchaseIntentRate: rate(input.interactions.purchaseIntent, input.interactions.total),
  };

  const diagnosis: { dimension: string; level: '风险' | '关注' | '优势'; conclusion: string }[] = [];
  if (core.trafficAchievement < 70 || funnel.viewRate < 20) {
    diagnosis.push({ dimension: '流量', level: '风险', conclusion: '曝光到观看承接不足，需复盘预热、投流和开播前召回。' });
  } else if (core.trafficAchievement < 90) {
    diagnosis.push({ dimension: '流量', level: '关注', conclusion: '流量低于计划，后续应提前锁定渠道和主播粉丝召回节奏。' });
  } else {
    diagnosis.push({ dimension: '流量', level: '优势', conclusion: '流量基本达到计划，具备继续放大投放的基础。' });
  }

  if (core.actualConversionRate < input.session.planned_conversion_rate || funnel.orderConversionRate < 8) {
    diagnosis.push({ dimension: '转化', level: '风险', conclusion: '商品点击后的下单转化偏弱，需优化利益点、价格锚点和逼单节点。' });
  } else {
    diagnosis.push({ dimension: '转化', level: '优势', conclusion: '转化率达到计划，当前货品与话术匹配度较好。' });
  }

  if (sentiment.negativeRate > 18 || sentiment.purchaseIntentRate < 12) {
    diagnosis.push({ dimension: '内容结构', level: '关注', conclusion: '负面反馈或购买意向不足，讲解结构需要增加信任证明与场景化演示。' });
  } else {
    diagnosis.push({ dimension: '内容结构', level: '优势', conclusion: '互动情绪稳定，内容节奏未出现明显舆情风险。' });
  }

  if (topProducts[0]?.contributionRate >= 65) {
    diagnosis.push({ dimension: '货品结构', level: '关注', conclusion: 'GMV 过度集中在少数商品，应准备替补爆款和关联搭配品。' });
  } else if (longTailProducts.length > input.products.length / 2) {
    diagnosis.push({ dimension: '货品结构', level: '风险', conclusion: '长尾商品占比过高，选品结构需要收敛。' });
  } else {
    diagnosis.push({ dimension: '货品结构', level: '优势', conclusion: '商品贡献较均衡，主推和补充品组合可复用。' });
  }

  if (anchor.performance_score >= 85) {
    diagnosis.push({ dimension: '主播表现', level: '优势', conclusion: `主播「${anchor.anchor_name}」控场稳定（${anchor.performance_score}分），转化率${anchor.conversion_rate}%，可继续承接主推品节奏。` });
  } else if (anchor.performance_score >= 60) {
    diagnosis.push({ dimension: '主播表现', level: '关注', conclusion: `主播「${anchor.anchor_name}」表现中规中矩（${anchor.performance_score}分），需加强节奏控制和卖点提炼。` });
  } else {
    diagnosis.push({ dimension: '主播表现', level: '风险', conclusion: `主播「${anchor.anchor_name}」表现偏低（${anchor.performance_score}分），需重点训练控场、话术和转化引导。` });
  }

  const scoreValue = boundedScore(
    core.gmvAchievement * 0.35
    + core.trafficAchievement * 0.2
    + achievement(core.actualConversionRate, input.session.planned_conversion_rate) * 0.25
    + core.durationAchievement * 0.1
    + (100 - Math.min(sentiment.negativeRate * 2, 40)) * 0.1
  );
  const score = {
    value: scoreValue,
    grade: grade(scoreValue),
  };

  const anchorName = input.anchor?.anchor_name || '未知主播';
  const suggestions = buildSuggestions(core, funnel, topProducts, longTailProducts, sentiment, anchor);
  const summary = `主播「${anchorName}」本场直播综合评定为${score.grade}级，GMV达成率${core.gmvAchievement}%，流量达成率${core.trafficAchievement}%，观看到下单转化率${core.actualConversionRate}%。${topProducts[0] ? `核心贡献商品为「${topProducts[0].product_name}」。` : ''}`;

  return {
    core,
    funnel,
    productContribution: {
      totalGmv: round(totalProductGmv),
      topProducts,
      longTailProducts,
      products: rankedProducts,
    },
    anchor,
    sentiment,
    diagnosis,
    suggestions,
    score,
    summary,
  };
}

function buildSuggestions(
  core: ReturnType<typeof buildLiveReviewAnalysis>['core'],
  funnel: ReturnType<typeof buildLiveReviewAnalysis>['funnel'],
  topProducts: any[],
  longTailProducts: any[],
  sentiment: ReturnType<typeof buildLiveReviewAnalysis>['sentiment'],
  anchor: NonNullable<LiveReviewInput['anchor']>,
) {
  const suggestions: string[] = [];

  if (core.trafficAchievement < 90) {
    suggestions.push('下一场开播前至少提前24小时完成私域预热、短视频种草和直播间预约召回。');
  } else {
    suggestions.push('流量承接基础较好，可在同类场次中保留当前预热节奏，并测试小幅增加投流预算。');
  }

  if (funnel.orderConversionRate < 10) {
    suggestions.push('优化点击后转化：主推品讲解中增加价格对比、限时权益和用户证言，缩短从种草到下单的链路。');
  } else {
    suggestions.push('保留高转化讲解节点，将成交高峰对应的话术沉淀到脚本库。');
  }

  if (longTailProducts.length > 0) {
    suggestions.push(`复盘长尾商品「${longTailProducts.map((item) => item.product_name).join('、')}」，下场减少低热度低转化商品讲解时长。`);
  } else {
    suggestions.push('当前商品结构未出现明显长尾拖累，可继续保持主推、利润款、补充款的组合。');
  }

  if (topProducts[0]) {
    suggestions.push(`围绕「${topProducts[0].product_name}」补充库存和关联搭配品，承接复购与加购需求。`);
  }

  if (sentiment.negativeRate > 15) {
    suggestions.push('针对负面弹幕集中问题建立预案话术，优先回应价格、质量、售后三类信任问题。');
  }

  if (anchor.performance_score < 85) {
    const gaps: string[] = [];
    if (anchor.conversion_rate < 3) gaps.push('转化话术和逼单节奏');
    if (anchor.interaction_rate < 15) gaps.push('互动引导和停留时长');
    if (anchor.script_execution_score < 80) gaps.push('脚本执行训练');
    const gapText = gaps.length > 0 ? gaps.join('、') : '控场和转化能力';
    suggestions.push(`主播「${anchor.anchor_name}」表现评分${anchor.performance_score}，建议强化${gapText}。`);
  } else {
    suggestions.push(`主播「${anchor.anchor_name}」表现稳定（${anchor.performance_score}分），可将当前话术节奏沉淀为脚本模板，赋能同品类其他主播。`);
  }

  return suggestions.slice(0, 6);
}
