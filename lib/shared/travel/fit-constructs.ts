/**
 * T11-B2 — Maximum State Coverage / Interaction 型付きレジストリ（**pure types + as-const data のみ**・未配線）
 *
 * 設計正本: docs/t11-a3.1-maximum-state-coverage.md / docs/t11-a3-state-model-deepening.md
 *
 * 役割: 旅行 fit の「状態空間」を**最大被覆**で型に固定する registry-only 層。
 *   - 14 family / 113 construct / 700 indicator を typed as-const で宣言（第一層・天井でない）。
 *   - construct を scoring に**全接続しない**（registry が先・rollup/interaction 実行は後続バンドル）。
 *   - ★ IndicatorKey は per-construct as-const から導出（`= string` 却下）。escape hatch は veto 不可。
 *   - ★ 相互作用は既存 component/construct/hardBlock の**修飾子**（modifies を型で限定・新並列スコア禁止）。
 *
 * データブロック(===GEN===)は workflow wl9fh1r1d + T11-A3.1 §3.1 から決定論生成。
 * 厳格性: 型 + as-const のみ。fetch/API/DB/UI/時刻API/乱数 なし。import は ./fit-types の型のみ。
 */

import type { EntityBurdenAxis, FitComponentKey, SharedTraitAxis, UserToleranceAxis } from "./fit-types";

export const CONSTRUCT_FAMILY_IDS = ["A_sensory", "B_burden", "C_time", "D_food", "E_money", "F_social", "G_meaning", "H_route", "I_support", "J_safety", "K_condition", "L_communication", "M_infra_work", "N_crosscut"] as const;
export type ConstructFamilyId = (typeof CONSTRUCT_FAMILY_IDS)[number];

export const LAYER_IDS = ["L1", "L1b", "L2", "L2b", "L3", "L4", "L4r", "L5", "L5r", "L6", "L7", "L8", "L9"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export const VALENCE_FACTORS = ["recoveryStyle", "tripIntent", "relationship", "timeOfDay", "fatigue", "role", "phase", "context"] as const;
export type ValenceFactor = (typeof VALENCE_FACTORS)[number];

/** 欠損挙動: 通常=confidence減+質問 / 安全=fail-closed / 価格=捏造禁止 / trait=中立 */
export const MISSING_DATA_POLICIES = ["ordinary", "safety_critical", "price_unknown", "trait_neutral"] as const;
export type MissingDataPolicy = (typeof MISSING_DATA_POLICIES)[number];

// ═══ INDICATOR registry (per-construct typed as-const → IndicatorKey を string にしない) ═══
export const INDICATOR_REGISTRY = {
  quietness: ["ambientNoiseFloorDb", "nightQuietness", "trafficRoadNoise", "mechanicalHum", "musicBgmPresence", "natureSoundProminence", "quietHoursPolicy"],
  acousticPrivacy: ["soundproofingBetweenRooms", "conversationContainment", "privateBathOrSpace", "seatSpacingAcoustic", "wallThinnessSignal", "overheardRisk"],
  crowdNoiseVolatility: ["peakCrowdBands", "crowdSwingAmplitude", "groupTourPresence", "noiseSpikeEvents", "queueCongestionNoise", "offPeakAvailability", "weekdayWeekendDelta"],
  lightingComfort: ["brightnessLevel", "colorTemperatureWarmth", "naturalLightAccess", "glareHarshness", "dimmabilityControl", "nightLightingScenery", "flickerArtificialStress"],
  smellAirComfort: ["tobaccoSmokeExposure", "cookingGreaseOdor", "ventilationFreshness", "intentionalScent", "moldDampMustiness", "sulfurOnsenOdor", "chemicalSensitivityTrigger"],
  temperatureComfort: ["indoorClimateControl", "outdoorExposureThermal", "humidityStickiness", "onsenWaterTempLoad", "draftColdSpots", "seasonalThermalSwing", "weatherSensitiveComfort"],
  sensoryIntensity: ["multiSensoryLoad", "visualBusyness", "stimulationPaceTempo", "noveltyStimulation", "calmnessTranquility", "overstimulationRiskFlag", "sensoryResetAvailability"],
  visualOpenness: ["vistaExpansiveness", "skyVisibility", "enclosureClaustrophobia", "ceilingHeightVolume", "horizonWaterfrontView", "crowdedSightlines"],
  spatialComfort: ["personalSpaceRoominess", "crowdDensityProximity", "seatingComfortType", "maneuveringEase", "layoutLegibilitySpatial", "privacyBufferDistance", "queueWaitingSpace"],
  walkingLoad: ["walkingDistanceKm", "surfaceRoughness", "continuousWalkSegmentMax", "walkSurfaceUnevenness", "egressWalkShare", "pavementShelterRatio", "lightingNightWalk"],
  stairsSlopeLoad: ["stairCount", "maxSlopeGrade", "verticalAscentM", "elevatorEscalatorAvail", "stairWidthCrowdInteraction", "stepFreeContinuity", "handrailRestPlatformAvail"],
  standingWaitingLoad: ["queueDurationMin", "seatedWaitAvail", "standingExposureWeatherTOD", "crowdDensityWhileWaiting", "waitUncertainty", "spotHoldingTimeHr", "restroomAccessWhileWaiting"],
  transferBurden: ["transferCountTyped", "interTransferWalkM", "transferPathwayMode", "minTransferTimeTightness", "transferCognitiveComplexity", "inSeatContinuity", "baggageHandlingPerTransfer"],
  baggageLoad: ["baggageVolumeWeight", "spatialOccupancyFootprint", "baggageStairCrowdInteraction", "luggageBaseDropAffordance", "luggageStorageDeliveryAvail", "carryDistanceWithBaggage", "baggageHandsBusyRatio"],
  terminalBurden: ["securityCheckOverheadMin", "intraTerminalWalkM", "verticalCirculationMode", "wayfindingComplexity", "fareGateBoardingFriction", "terminalCrowdDensity", "earlyArrivalBufferReq"],
  fatigueRisk: ["cumulativeEffortIndex", "legCarryoverDepth", "backToBackHighEffort", "recoverySlackBetweenLegs", "reliabilityPTI", "scheduleAsymmetrySDL", "sleepDisruptionLoad", "circadianMismatchLoad"],
  recoveryValue: ["restQuietValue", "onsenTherapeuticValue", "natureProximityRestoration", "sensoryDecompressionValue", "privacyRecoveryValue", "bufferSlackRecovery", "arrivalFreshnessValue"],
  stimulationRecovery: ["stimulationRestorationValue", "achievementValue", "aweValue", "flowImmersionValue", "socialReplenishmentValue", "scenicActiveRestoration"],
  overstimulationRisk: ["sensoryLoadIndex", "crowdNoiseLevel", "visualBusyness", "soundFloorIntrusion", "peakCrowdBandExposure", "continuousStimDurationMin", "escapeRetreatAvail"],
  morningBurden: ["fixedBreakfastWindow", "earlyCheckoutTime", "earlyOpeningTargetNeed", "preDepartureSecurityBuffer", "sunriseDependentValue", "earlyReservationSlotOnly", "morningTransferDensity"],
  nightSuitability: ["nightViewValue", "nightlifeDensity", "lateNightServiceWindow", "nightQuietnessValue", "nightReturnEgressBurden", "nightSafetyPerceptionLoad", "celestialNightWindow"],
  scheduleRigidity: ["fixedReservationTime", "fixedDepartureTimetable", "narrowCheckInCheckOutBand", "spotReservationHoldTime", "guidedTourFixedStart", "sequencedTimedEntryChain", "lastServiceHardDeadline"],
  durationFit: ["typicalDurationMin", "minimumViableDwell", "openEndedStayRisk", "courseFixedNonInterruptible", "queueInclusiveDuration", "multiStopChainDuration"],
  waitTolerance: ["queueWaitMinutes", "transferWaitBuffer", "spotReservationWaitLoad", "boardingQueueLoad", "reservationTimedSlotWait", "shelterAvailabilityAtWait"],
  timeWindowFragility: ["seasonWindowDays", "bloomPhenologyWindow", "festivalFixedDate", "exhibitionRunWindow", "precisePhenomenonTiming", "yearOnYearVariability"],
  seasonality: ["seasonalPeakBands", "winterEmotionalAmplification", "autumnSpringPhotogenicPeak", "summerHeatBathingLoad", "seasonalClosurePeriod", "shoulderSeasonValue"],
  weatherTiming: ["outdoorExposureRatio", "rainValueModifier", "indoorFallbackQuality", "cancelOnWeatherThreshold", "serviceSuspensionRisk", "coveredRouteContinuity"],
  openingHourDependency: ["operatingHoursBand", "lastEntryCutoff", "dayOfWeekClosure", "seasonalOperatingClosure", "is24hAvailability", "arrivalTimeWindowMatch", "operatingWindowMissRisk"],
  cuisineAffinity: ["cuisineSystemMatch", "flavorIntensityFit", "formatPreferenceFit", "ingredientFreshnessValue", "specialtyDishDraw", "dietaryStyleAlignment", "presentationAesthetic"],
  mealRoleAffinity: ["destinationMealAffinity", "refuelAffinity", "celebrationAffinity", "localDiscoveryAffinity", "socialConversationAffinity", "quickStopAffinity", "lateNightRescueAffinity", "breakfastAnchorAffinity"],
  portionHeaviness: ["portionVolume", "richnessOiliness", "courseFixedNoLeaveInteraction", "sequentialMealLoadCarryover", "calorieDensityBand", "digestiveAftermath"],
  localFoodValue: ["localPatronageRatio", "touristCaptureLevel", "chainVsIndependent", "regionalSpecialtyPresence", "seasonalLocalSourcing", "discoveryStorytelling"],
  comfortFoodValue: ["predictability", "knownChainFamiliarity", "lowDecisionLoad", "emotionalSoothing", "lowSensoryStimulation", "noCommitmentEase"],
  conversationMealFit: ["noiseFloor", "counterDividesConversation", "seatSpacing", "longStayTolerated", "tableGeometry", "groupTableAffordance", "ambientPrivacy"],
  queueWaitBurden: ["expectedWaitMin", "waitVariance", "reservationAvailability", "queuePhysicalDiscomfort", "peakTimeSurge", "queueDuringFatigue", "groupCoordinationWait"],
  allergyDietarySafety: ["allergenHandlingState", "specifiedAllergen8Coverage", "recommended20Coverage", "crossContaminationControl", "dietaryRegimeSupport", "medicalDietExertionSafe", "ingredientTransparency"],
  mealAnchorImportance: ["breakfastImportanceWeight", "dinnerImportanceWeight", "lodgingMealCoupling", "mealTimingRigidity", "skipMealTolerance", "mealAsScheduleDriver"],
  destinationRefuelTension: ["destinationGravity", "refuelEfficiency", "experienceRichness", "stayDurationExpectation", "commitmentRequired", "scheduleFlexibility"],
  budgetPressure: ["priceBandRelativeToRedLine", "absolutePriceTier", "userBudgetSensitivity", "marginalCostOverBaseline", "perDayBurnRate", "currencyExchangeOverhead", "hiddenSurchargeExposure"],
  valueForMoney: ["benefitPerYen", "qualityPriceConsistency", "inclusionsBundleValue", "scarcityWorthMatch", "touristPremiumPenalty", "experientialReturn"],
  splurgeWorthiness: ["occasionSignificance", "onceInLifetimeScarcity", "selfInvestmentFraming", "dignityFloorSpend", "splurgeRegretRisk", "relationalGiftValue"],
  cancellationFlexibility: ["refundPenaltyBand", "freeCancelDeadlineProximity", "cancellableBinary", "providerCancelClass", "weatherCancelClause", "rebookingFriction"],
  bookingRigidity: ["reservationLeadTime", "instantVsRequestConfirm", "timedEntryConstraint", "phoneOnlyChannelFriction", "lotteryOrCapacityGate", "walkInFreedomDegree"],
  paymentFriction: ["cashOnlyExposure", "cashlessAcceptanceBreadth", "atmAccessProximity", "tippingOrServiceChargeNorm", "prepaymentRequirement", "splitPaymentFriction"],
  priceVolatilityExposure: ["seasonalPriceSwing", "dayOfWeekSurcharge", "demandSurgeSensitivity", "lastMinuteVsAdvanceGap", "priceBandWidthUncertainty"],
  irreversibleCommitment: ["nonRefundableFlag", "deadlinePassedLock", "sunkPrepaymentSize", "tripCriticalUnsecurable", "perishableWindowSpend", "transferabilityToOthers"],
  romanceSuitability: ["twoPersonPrivacy", "intimateSeating", "ambientWarmth", "groupExposure", "specialOccasionAffordance", "decompressionForTwo"],
  familySuitability: ["childAffordance", "noiseTolerance", "kashikiriForFamily", "multiGenerationEase", "mealFlexibilityForKids", "safetyForChildren"],
  friendSuitability: ["groupTableAffordance", "livelyAtmosphere", "lowFormality", "splitBillEase", "sharedActivityGravity", "walkAndTalkFlow"],
  soloSuitability: ["soloComfortNoStigma", "soloSafetyPerception", "supportLifeline", "soloAllowedGate", "selfPacedAutonomy", "soloDecompressionSpace"],
  colleagueSuitability: ["professionalDistance", "individualPrivacy", "conversationManageability", "workability", "neutralFormality", "splitBillNeutrality"],
  conversationSuitability: ["noiseFloor", "seatSpacing", "counterDividesConversation", "longStayTolerated", "interruptionCadence", "acousticPrivacy"],
  privacyForTwo: ["enclosureLevel", "soundIsolation", "sightlineSeclusion", "lowThroughTraffic", "exclusiveUseAffordance"],
  groupFairnessPressure: ["burdenImbalance", "preferenceDispersion", "costSharingFriction", "paceMismatch", "voiceAsymmetry", "accommodationConflict"],
  decisionFriction: ["coordinationOverhead", "optionConsensusDifficulty", "reversalCostAnxiety", "leadTimePressure", "responsibilityBurden"],
  participantSacrificeRisk: ["worstParticipantFit", "constraintViolationForOne", "enduranceOverload", "exclusionRisk", "silentDissatisfaction"],
  relationalTemperatureMatch: ["intimacyLevelOfSetting", "formalityRegister", "forcedClosenessRisk", "socialExposureLevel", "warmthOfService"],
  sharedExperienceGravity: ["coParticipationAffordance", "memorabilityForGroup", "conversationSeedRichness", "collaborativeFlow", "aweSharing"],
  noveltyValue: ["firstEncounterDistinctiveness", "rarityOfKind", "unexpectedness", "explorabilityDepth", "offBeatenPath", "noveltyRecencyHalfLife"],
  familiarityValue: ["archetypeRecognizability", "culturalScriptClarity", "predictabilityOfExperience", "comfortRecognition", "lowLearningCurve"],
  localnessValue: ["regionalSpecificity", "vernacularAuthenticity", "localProvenanceOfMaterials", "livingTraditionPresence", "communityEmbeddedness", "dialectAndAtmosphere"],
  polishednessValue: ["executionPrecision", "serviceAttentiveness", "cleanlinessAndUpkeep", "materialQualitySignal", "coherenceOfDesign", "refinedRestraint"],
  culturalDepthValue: ["historicalContinuity", "spiritualSignificance", "narrativeRichness", "intangibleHeritagePresence", "contextualLayering", "authenticityOfPractice", "symbolicResonance"],
  learningDepthValue: ["informationDensity", "conceptualChallenge", "interpretiveScaffolding", "experientialLearning", "expertiseDepthAvailable", "transferableInsight"],
  photogenicValue: ["compositionalStrength", "iconicRecognizability", "colorVibrancy", "momentaryDrama", "sceneNovelty", "shareability"],
  aestheticRefinementValue: ["designTaste", "atmosphericBeauty", "harmonyWithSetting", "subtleSophistication", "sensoryAestheticDetail", "compositionalElegance"],
  heritageDepthValue: ["ageAndPatina", "preservationIntegrity", "historicalLayerVisibility", "architecturalSignificance", "designationStatus", "continuityOfUse"],
  natureImmersionValue: ["naturalScale", "immersionDepth", "biodiversityRichness", "soundscapeNaturalness", "restorativeQuality", "seasonalExpressiveness", "elementalContact"],
  adventureValue: ["challengeIntensity", "thrillExhilaration", "achievementSatisfaction", "skillExpression", "explorationFrontier", "controlledRisk"],
  firstMileBurden: ["accessTimeMin", "accessModeFriction", "accessWalkKm", "accessStepFree", "accessPredictability", "luggageHandlingAtOrigin"],
  mainLegBurden: ["inVehicleMin", "mainModeType", "boardAlightFriction", "legCountAlongMain", "cabinComfortBaseline", "punctualityClass"],
  lastMileBurden: ["egressTimeMin", "egressModeFriction", "egressWalkKm", "directnessAfterArrival", "egressStepFree", "lastMileTimeOfDayPenalty"],
  airportToCityBurden: ["airportAccessMode", "airportToCenterMin", "baggageClaimOverheadMin", "airportAccessFrequency", "airportAccessCostBand", "airportTransferReliability"],
  stationToHotelBurden: ["stationToHotelMin", "stationToHotelWalkKm", "stationToHotelStepFree", "shuttleAvailability", "hotelDropEnables", "uphillToHotel"],
  transferComplexityBurden: ["transferCount", "gtfsTransferType", "pathwayMode", "levelChange", "signageComplexity", "minTransferMin", "transferAccessibilityBarrier"],
  terminalWalkingBurden: ["terminalWalkMin", "intraTerminalDistance", "verticalTransport", "movingWalkwayAvail", "terminalCrowdDensity", "terminalWayfinding"],
  securityCheckinGateBurden: ["securityOverheadMin", "checkinOverheadMin", "fareGateFriction", "immigrationOverheadMin", "queueVariance", "preClearanceAvail"],
  waitBufferBurden: ["scheduledWaitMin", "requiredBufferMin", "waitEnvironmentQuality", "connectionTightness", "headwayToNextOption", "earlyArrivalSlack"],
  reliabilityBurden: ["planningTimeIndex", "travelTimeIndex", "bufferIndex", "weatherSensitivity", "modeDelayPropensity", "scheduleDensity"],
  delayRiskBurden: ["missedConnectionRisk", "lateArrivalPenaltyWeight", "earlyArrivalPenaltyWeight", "cascadeDepth", "recoveryOptionDensity", "downstreamLockExposure"],
  seatProbabilityBurden: ["seatProbability", "reservationRequiredForSeat", "standingDurationIfUnseated", "peakCongestionExposure", "luggageStowability"],
  workabilityValue: ["workability", "powerOutletAvail", "connectivityQuality", "tableSurfaceQuality", "quietForFocus", "seatStability"],
  sleepabilityValue: ["sleepability", "reclineDepth", "darknessQuietForSleep", "interruptionFrequency", "overnightOption", "restRecoveryYield"],
  scenicValue: ["scenicValue", "windowAccessQuality", "routeSceneryRarity", "seasonalSceneryPeak", "daylightOverlapForView", "modeAsExperience"],
  arrivalFreshness: ["cumulativeRouteFatigue", "totalDoorToDoorMin", "restOpportunityEnRoute", "arrivalTimeOfDayQuality", "transitionSmoothness", "energyCarryToFirstActivity"],
  // C5.1: ★ door-to-door 総 route 負荷の集約 construct（walkingLoad に総負荷を入れない意味論修正）
  routeChainBurden: ["doorToDoorTotalNorm", "egressAsymmetry", "terminalOverhead", "transferPenalty", "reliabilityPenalty", "baggageInteraction", "accessEgressBurden"],
  luggageDropBurden: ["dropAffordance", "lockerAvailabilityDensity", "earlyCheckinPossible", "luggageHoldBeforeCheckin", "deliveryServiceAvail", "dropDetourCost"],
  destinationOrderingBurden: ["mustPrecedeConstraints", "luggageDropEnablesOrdering", "reorderabilityDegree", "shortestFromTerminalGain", "backtrackPenalty", "geographicClustering"],
  lastDepartureLockBurden: ["lastDepartureTime", "lockHardness", "bufferToLastDeparture", "fallbackAfterLastDeparture", "lockTightnessVsPlan"],
  timedEntryLockBurden: ["timedEntrySlot", "slotRigidity", "arrivalBufferToSlot", "slotChainCount", "rebookFlexibility"],
  openHoursLockBurden: ["openHoursWindow", "lastEntryCutoff", "closedDayRisk", "seasonalHoursVariance", "windowFitToArrival", "crowdedHourWithinWindow"],
  fallbackRouteAvailability: ["alternateRouteCount", "modeRedundancy", "headwayResilience", "weatherFallbackQuality", "rebookingFlexibility", "strandingRiskIfNoFallback"],
  luggageRelief: ["coinLockerDensity", "lockerSizeFit", "mannedStorageAvailable", "hotelLuggageDropoff", "handsFreeDelivery", "lockerProximityToNode", "stationLockerAppReservable"],
  physiologicalRelief: ["publicRestroomDensity", "multipurposeRestroom", "nursingRoom", "restroomCleanlinessHint", "restroomOperatingWindow", "restSpotForRelief"],
  supplyRelief: ["konbiniDensity", "drugstoreAccess", "supermarketAccess", "kioskOrVending", "multiReliefBundleBreadth", "supplyOperatingWindow"],
  cashRelief: ["atmDensity", "atmOperatingWindow", "currencyExchange", "icChargePoint", "cashlessAcceptanceAtDestination", "atmCardCompatibility"],
  connectivityRelief: ["publicWifiAvailability", "chargingPoints", "cellularCoverageNote", "simEsimAvailability", "loungeOrCafeWifiComfort"],
  restRelief: ["benchPlazaDensity", "restCafeAvailability", "paidLoungeAccess", "stationWaitingArea", "indoorWeatherShelter", "stayToleranceHint"],
  accessibilitySupport: ["stepFreeContinuity", "elevatorEscalatorAvailability", "wheelchairAccessState", "multipurposeToiletOnPath", "assistanceServiceAvailable", "levelBoardingAtTransfers", "pathSurfaceAndWidth"],
  careSupport: ["nursingDiaperFacility", "strollerNavigability", "childFriendlyAmenities", "strollerRentalOrAids", "quietRestForCaregiver", "careOperatingWindow"],
  emergencyFallback: ["pharmacyAccess", "clinicReferenceProximity", "emergencyMedAccess", "firstAidPoint", "weatherContingencyFallback", "infoHelpForEmergency"],
  informationHelp: ["touristInfoCenter", "signageAndWayfinding", "multilingualSupport", "humanHelpAvailability", "digitalNavSupport"],
  reservationEligibility: ["reservationDifficulty", "cancelFlexibility", "necessity", "leadTimeRequired", "timedEntryConstraint", "reservationFailureRisk", "qualityProxyForReservation"],
  perceivedSafety: ["daytimeSafety", "nighttimeSafety", "footTrafficNight", "litLevel", "isolationExposure", "redlightAdjacency", "womanAloneComfort", "naturalSurveillance", "emergencyServiceProximity"],
  crisisRobustness: ["disasterExposure", "evacuationClarity", "languageBarrierInEmergency", "seismicProxy", "floodTsunamiProxy"],
  hygieneCleanliness: ["roomBeddingHygiene", "bathroomSanitation", "sharedBathCleanliness", "foodPremisesHygiene", "linenFreshness", "pestSignal", "surfaceWornVsDirty", "toiletCleanlinessSupport"],
  languageAccessibility: ["menuTranslationAvail", "signageMultilingual", "staffForeignLanguageCapacity", "foreignerFriendlinessSignal", "cashlessForForeigner", "translationTechReliance"],
  ritualSocialCompetenceLoad: ["omakaseRitualLoad", "tippingEtiquetteAmbiguity", "reservationPhoneOnlyJapanese", "membersOnlyReferralBarrier"],
  digitalConnectivity: ["cellularCoverageBand", "wifiQualityNotPresence", "powerOutletAccess", "deadZoneRisk", "eSIMroamingViability", "navigationOfflineNeed"],
  workSuitability: ["deskWorkability", "callPrivacyQuiet", "screenLightingGlare", "longSittingComfort", "meetingSpaceAccess", "ergonomicSeating"],
  noveltySeeking: ["unfamiliarityAppetite", "discoveryDrive", "routinePreference", "riskOfDisappointmentTolerance", "plannedVsSpontaneous"],
  paceAutonomy: ["spontaneityNeed", "structureNeed", "autonomyVsGuided", "marginPreference", "decisionFatigueSensitivity"],
  childFamilyFriendliness: ["strollerNavigability", "nursingDiaperFacility", "childMenuTolerance", "kidSafetyHazards", "familyRoomAffordance", "noiseToleranceForKids", "ageAppropriateEngagement"],
  gradedAccessibilityComfort: ["stepCountTolerable", "restPlatformDensity", "handrailContinuity", "seatingFrequency", "distanceWithoutRest"],
} as const;

export type ConstructAxis = keyof typeof INDICATOR_REGISTRY;
export type IndicatorKey = (typeof INDICATOR_REGISTRY)[ConstructAxis][number];

export interface ConstructSpec {
  family: ConstructFamilyId;
  ja: string;
  /** 主たる所属層 */
  layer: LayerId;
  /** 二次層（横断時のみ） */
  secondaryLayer?: LayerId;
  /** §5 多因子 valence の符号/強度を変える因子 */
  valence: readonly ValenceFactor[];
  missingData: MissingDataPolicy;
}

// ═══ CONSTRUCT registry (113・family 構造 + 代表 construct を欠落なく宣言) ═══
export const CONSTRUCT_REGISTRY: Record<ConstructAxis, ConstructSpec> = {
  quietness: { family: "A_sensory", ja: "静けさ", layer: "L1b", secondaryLayer: "L1", valence: ["recoveryStyle", "tripIntent", "timeOfDay", "fatigue", "relationship"], missingData: "ordinary" },
  acousticPrivacy: { family: "A_sensory", ja: "音の遮蔽・プライバシー", layer: "L1b", secondaryLayer: "L5r", valence: ["relationship", "tripIntent", "role"], missingData: "ordinary" },
  crowdNoiseVolatility: { family: "A_sensory", ja: "混雑・騒音の変動性", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent", "context", "phase", "fatigue", "timeOfDay"], missingData: "ordinary" },
  lightingComfort: { family: "A_sensory", ja: "照明・明るさの快適性", layer: "L1b", secondaryLayer: "L4r", valence: ["timeOfDay", "tripIntent", "recoveryStyle", "context", "phase"], missingData: "ordinary" },
  smellAirComfort: { family: "A_sensory", ja: "におい・空気の快適性", layer: "L1b", secondaryLayer: "L2b", valence: ["tripIntent", "recoveryStyle", "role", "context", "relationship"], missingData: "ordinary" },
  temperatureComfort: { family: "A_sensory", ja: "温度・体感気候の快適性", layer: "L1b", secondaryLayer: "L1", valence: ["context", "tripIntent", "recoveryStyle", "timeOfDay", "fatigue"], missingData: "ordinary" },
  sensoryIntensity: { family: "A_sensory", ja: "感覚刺激の総量", layer: "L4r", secondaryLayer: "L1", valence: ["recoveryStyle", "tripIntent", "fatigue", "phase", "context"], missingData: "ordinary" },
  visualOpenness: { family: "A_sensory", ja: "視界の開放感", layer: "L1b", secondaryLayer: "L1", valence: ["tripIntent", "recoveryStyle", "relationship", "context"], missingData: "ordinary" },
  spatialComfort: { family: "A_sensory", ja: "空間のゆとり・物理的快適性", layer: "L1b", secondaryLayer: "L2b", valence: ["relationship", "tripIntent", "fatigue", "role", "context"], missingData: "ordinary" },
  walkingLoad: { family: "B_burden", ja: "歩行負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  stairsSlopeLoad: { family: "B_burden", ja: "階段・坂負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  standingWaitingLoad: { family: "B_burden", ja: "立ち・待機負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  transferBurden: { family: "B_burden", ja: "乗換負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  baggageLoad: { family: "B_burden", ja: "荷物負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  terminalBurden: { family: "B_burden", ja: "ターミナル負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  fatigueRisk: { family: "B_burden", ja: "疲労蓄積リスク", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  recoveryValue: { family: "B_burden", ja: "回復価値", layer: "L4r", secondaryLayer: "L4", valence: ["tripIntent"], missingData: "ordinary" },
  stimulationRecovery: { family: "B_burden", ja: "刺激による回復", layer: "L4r", secondaryLayer: "L4", valence: ["tripIntent"], missingData: "ordinary" },
  overstimulationRisk: { family: "B_burden", ja: "過刺激リスク", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  morningBurden: { family: "C_time", ja: "朝負荷", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  nightSuitability: { family: "C_time", ja: "夜適性", layer: "L1b", secondaryLayer: "L1", valence: ["tripIntent"], missingData: "ordinary" },
  scheduleRigidity: { family: "C_time", ja: "スケジュール硬直性", layer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  durationFit: { family: "C_time", ja: "所要時間適合", layer: "L1b", secondaryLayer: "L1", valence: ["tripIntent"], missingData: "ordinary" },
  waitTolerance: { family: "C_time", ja: "待機耐性", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent"], missingData: "ordinary" },
  timeWindowFragility: { family: "C_time", ja: "時間窓脆弱性", layer: "L5", valence: ["tripIntent"], missingData: "ordinary" },
  seasonality: { family: "C_time", ja: "季節性", layer: "L6", valence: ["tripIntent"], missingData: "ordinary" },
  weatherTiming: { family: "C_time", ja: "天候タイミング", layer: "L5", secondaryLayer: "L6", valence: ["tripIntent"], missingData: "ordinary" },
  openingHourDependency: { family: "C_time", ja: "営業時間依存", layer: "L5", valence: ["tripIntent"], missingData: "ordinary" },
  cuisineAffinity: { family: "D_food", ja: "料理系統の相性", layer: "L1", valence: ["tripIntent", "fatigue", "phase"], missingData: "ordinary" },
  mealRoleAffinity: { family: "D_food", ja: "食事の役割適性", layer: "L3", valence: ["tripIntent", "relationship", "timeOfDay", "phase"], missingData: "ordinary" },
  portionHeaviness: { family: "D_food", ja: "量・重さ", layer: "L2", valence: ["recoveryStyle", "fatigue", "timeOfDay", "tripIntent", "phase"], missingData: "ordinary" },
  localFoodValue: { family: "D_food", ja: "地元の食の価値", layer: "L1", valence: ["recoveryStyle", "tripIntent", "phase", "relationship"], missingData: "ordinary" },
  comfortFoodValue: { family: "D_food", ja: "安心の食の価値", layer: "L4r", secondaryLayer: "L4", valence: ["recoveryStyle", "fatigue", "tripIntent", "phase", "context"], missingData: "ordinary" },
  conversationMealFit: { family: "D_food", ja: "会話のしやすさ", layer: "L1", valence: ["relationship", "tripIntent", "role", "context"], missingData: "ordinary" },
  queueWaitBurden: { family: "D_food", ja: "行列・待ちの負荷", layer: "L2", valence: ["fatigue", "tripIntent", "timeOfDay", "phase", "context"], missingData: "ordinary" },
  allergyDietarySafety: { family: "D_food", ja: "アレルギー・食事制約の安全", layer: "L5", valence: ["tripIntent"], missingData: "safety_critical" },
  mealAnchorImportance: { family: "D_food", ja: "朝食・夕食の重要度", layer: "L6", valence: ["tripIntent", "relationship", "timeOfDay", "phase"], missingData: "ordinary" },
  destinationRefuelTension: { family: "D_food", ja: "目的地 vs 燃料補給", layer: "L3", valence: ["tripIntent", "fatigue", "phase", "timeOfDay", "context"], missingData: "ordinary" },
  budgetPressure: { family: "E_money", ja: "予算圧力", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent", "role", "context", "relationship"], missingData: "price_unknown" },
  valueForMoney: { family: "E_money", ja: "費用対効果", layer: "L1", valence: ["tripIntent", "recoveryStyle", "role", "relationship"], missingData: "price_unknown" },
  splurgeWorthiness: { family: "E_money", ja: "奮発の価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase", "recoveryStyle"], missingData: "price_unknown" },
  cancellationFlexibility: { family: "E_money", ja: "取消柔軟性", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent", "context", "phase", "fatigue", "role"], missingData: "ordinary" },
  bookingRigidity: { family: "E_money", ja: "予約硬直性", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent", "phase", "context", "role", "relationship"], missingData: "ordinary" },
  paymentFriction: { family: "E_money", ja: "支払い摩擦", layer: "L2b", secondaryLayer: "L2", valence: ["relationship", "role", "context", "tripIntent"], missingData: "price_unknown" },
  priceVolatilityExposure: { family: "E_money", ja: "価格変動曝露", layer: "L2b", secondaryLayer: "L2", valence: ["tripIntent", "phase", "context"], missingData: "price_unknown" },
  irreversibleCommitment: { family: "E_money", ja: "不可逆コミット", layer: "L2b", secondaryLayer: "L2", valence: ["phase", "tripIntent", "context", "fatigue", "relationship"], missingData: "ordinary" },
  romanceSuitability: { family: "F_social", ja: "恋人・パートナー適性", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "tripIntent", "timeOfDay", "phase", "context"], missingData: "ordinary" },
  familySuitability: { family: "F_social", ja: "家族適性", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "role", "fatigue", "context"], missingData: "ordinary" },
  friendSuitability: { family: "F_social", ja: "友人適性", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "tripIntent", "context", "phase"], missingData: "ordinary" },
  soloSuitability: { family: "F_social", ja: "ひとり適性", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "tripIntent", "context", "fatigue"], missingData: "ordinary" },
  colleagueSuitability: { family: "F_social", ja: "同僚・仕事関係適性", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "tripIntent", "context", "role"], missingData: "ordinary" },
  conversationSuitability: { family: "F_social", ja: "会話適性", layer: "L1", valence: ["tripIntent", "relationship", "context", "role"], missingData: "ordinary" },
  privacyForTwo: { family: "F_social", ja: "二人の私密性", layer: "L1", valence: ["relationship", "tripIntent", "phase", "context"], missingData: "ordinary" },
  groupFairnessPressure: { family: "F_social", ja: "集団内の公平性圧", layer: "L1", valence: ["relationship", "role", "context"], missingData: "ordinary" },
  decisionFriction: { family: "F_social", ja: "意思決定の摩擦", layer: "L1", valence: ["relationship", "tripIntent", "phase", "context"], missingData: "ordinary" },
  participantSacrificeRisk: { family: "F_social", ja: "参加者の犠牲リスク", layer: "L1", valence: ["relationship", "role", "context"], missingData: "ordinary" },
  relationalTemperatureMatch: { family: "F_social", ja: "関係温度の適合", layer: "L5r", secondaryLayer: "L5", valence: ["relationship", "tripIntent", "role", "context", "phase"], missingData: "ordinary" },
  sharedExperienceGravity: { family: "F_social", ja: "共有体験の引力", layer: "L1", valence: ["relationship", "tripIntent", "phase", "context"], missingData: "ordinary" },
  noveltyValue: { family: "G_meaning", ja: "新規性価値", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue", "phase", "relationship"], missingData: "ordinary" },
  familiarityValue: { family: "G_meaning", ja: "馴染み価値", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue", "relationship", "phase"], missingData: "ordinary" },
  localnessValue: { family: "G_meaning", ja: "土地らしさ価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase"], missingData: "ordinary" },
  polishednessValue: { family: "G_meaning", ja: "洗練価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase"], missingData: "ordinary" },
  culturalDepthValue: { family: "G_meaning", ja: "文化的深さ価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase", "timeOfDay"], missingData: "ordinary" },
  learningDepthValue: { family: "G_meaning", ja: "学びの深さ価値", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue", "role", "relationship"], missingData: "ordinary" },
  photogenicValue: { family: "G_meaning", ja: "写真映え価値", layer: "L1", valence: ["tripIntent", "relationship", "timeOfDay", "role", "phase"], missingData: "ordinary" },
  aestheticRefinementValue: { family: "G_meaning", ja: "美的洗練価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase", "timeOfDay"], missingData: "ordinary" },
  heritageDepthValue: { family: "G_meaning", ja: "遺産の深さ価値", layer: "L1", valence: ["tripIntent", "relationship", "role", "phase"], missingData: "ordinary" },
  natureImmersionValue: { family: "G_meaning", ja: "自然没入価値", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue", "relationship", "timeOfDay", "phase"], missingData: "ordinary" },
  adventureValue: { family: "G_meaning", ja: "冒険価値", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue", "relationship", "role", "phase"], missingData: "ordinary" },
  firstMileBurden: { family: "H_route", ja: "ファーストマイル負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "timeOfDay", "role"], missingData: "ordinary" },
  mainLegBurden: { family: "H_route", ja: "メインレグ負荷", layer: "L2", secondaryLayer: "L7", valence: ["tripIntent", "fatigue", "phase", "role"], missingData: "ordinary" },
  lastMileBurden: { family: "H_route", ja: "ラストマイル負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "timeOfDay", "role", "phase"], missingData: "ordinary" },
  airportToCityBurden: { family: "H_route", ja: "空港→市内アクセス負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "timeOfDay", "tripIntent", "role"], missingData: "ordinary" },
  stationToHotelBurden: { family: "H_route", ja: "駅→宿アクセス負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "role", "timeOfDay", "phase"], missingData: "ordinary" },
  transferComplexityBurden: { family: "H_route", ja: "乗換複雑性負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "tripIntent", "role", "phase"], missingData: "ordinary" },
  terminalWalkingBurden: { family: "H_route", ja: "ターミナル内徒歩負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "role", "phase", "timeOfDay"], missingData: "ordinary" },
  securityCheckinGateBurden: { family: "H_route", ja: "保安/搭乗手続/改札 通過負荷", layer: "L2", secondaryLayer: "L7", valence: ["timeOfDay", "tripIntent", "role"], missingData: "ordinary" },
  waitBufferBurden: { family: "H_route", ja: "待ち/バッファ負荷", layer: "L2", secondaryLayer: "L7", valence: ["tripIntent", "fatigue", "role", "timeOfDay"], missingData: "ordinary" },
  reliabilityBurden: { family: "H_route", ja: "信頼性負荷", layer: "L2", secondaryLayer: "L7", valence: ["tripIntent", "role", "phase"], missingData: "ordinary" },
  delayRiskBurden: { family: "H_route", ja: "遅延・乗り遅れリスク負荷", layer: "L2", secondaryLayer: "L7", valence: ["tripIntent", "role", "phase", "context"], missingData: "ordinary" },
  seatProbabilityBurden: { family: "H_route", ja: "着席不確実負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "role", "timeOfDay", "phase"], missingData: "ordinary" },
  workabilityValue: { family: "H_route", ja: "車内作業性価値", layer: "L4r", secondaryLayer: "L1", valence: ["tripIntent", "role", "phase", "timeOfDay"], missingData: "ordinary" },
  sleepabilityValue: { family: "H_route", ja: "車内睡眠/休息価値", layer: "L4r", secondaryLayer: "L1", valence: ["tripIntent", "fatigue", "phase", "timeOfDay"], missingData: "ordinary" },
  scenicValue: { family: "H_route", ja: "車窓・移動景観価値", layer: "L4r", secondaryLayer: "L1", valence: ["tripIntent", "recoveryStyle", "timeOfDay", "role", "context"], missingData: "ordinary" },
  arrivalFreshness: { family: "H_route", ja: "到着時鮮度", layer: "L4r", secondaryLayer: "L4", valence: ["fatigue", "phase", "tripIntent", "timeOfDay", "role"], missingData: "ordinary" },
  routeChainBurden: { family: "H_route", ja: "door-to-door 総 route 負荷", layer: "L7", secondaryLayer: "L2", valence: ["tripIntent", "fatigue", "role"], missingData: "ordinary" },
  luggageDropBurden: { family: "H_route", ja: "荷物預け/身軽化負荷", layer: "L2", secondaryLayer: "L7", valence: ["fatigue", "phase", "role", "timeOfDay"], missingData: "ordinary" },
  destinationOrderingBurden: { family: "H_route", ja: "目的地順序負荷", layer: "L6", secondaryLayer: "L7", valence: ["tripIntent", "phase", "role", "context"], missingData: "ordinary" },
  lastDepartureLockBurden: { family: "H_route", ja: "最終便/終電ロック負荷", layer: "L5", secondaryLayer: "L7", valence: ["tripIntent", "role", "phase", "context"], missingData: "ordinary" },
  timedEntryLockBurden: { family: "H_route", ja: "時間指定入場ロック負荷", layer: "L5", secondaryLayer: "L7", valence: ["tripIntent", "phase", "role", "context"], missingData: "ordinary" },
  openHoursLockBurden: { family: "H_route", ja: "営業/開館時間ロック負荷", layer: "L5", secondaryLayer: "L6", valence: ["timeOfDay", "phase", "tripIntent", "context"], missingData: "ordinary" },
  fallbackRouteAvailability: { family: "H_route", ja: "代替経路余裕", layer: "L4r", secondaryLayer: "L4", valence: ["tripIntent", "context", "role", "phase"], missingData: "ordinary" },
  luggageRelief: { family: "I_support", ja: "荷物解放", layer: "L1b", secondaryLayer: "L2b", valence: ["context"], missingData: "ordinary" },
  physiologicalRelief: { family: "I_support", ja: "生理的解放", layer: "L1b", secondaryLayer: "L2b", valence: ["role", "context"], missingData: "safety_critical" },
  supplyRelief: { family: "I_support", ja: "物資補給", layer: "L1b", secondaryLayer: "L2b", valence: ["fatigue"], missingData: "ordinary" },
  cashRelief: { family: "I_support", ja: "現金アクセス", layer: "L1b", secondaryLayer: "L2b", valence: ["phase"], missingData: "ordinary" },
  connectivityRelief: { family: "I_support", ja: "接続性", layer: "L1b", secondaryLayer: "L2b", valence: ["fatigue"], missingData: "ordinary" },
  restRelief: { family: "I_support", ja: "休息・退避", layer: "L1b", secondaryLayer: "L2b", valence: ["tripIntent"], missingData: "ordinary" },
  accessibilitySupport: { family: "I_support", ja: "アクセシビリティ支援", layer: "L1b", secondaryLayer: "L1", valence: ["role"], missingData: "safety_critical" },
  careSupport: { family: "I_support", ja: "育児・介護・ケア支援", layer: "L1b", secondaryLayer: "L5r", valence: ["context"], missingData: "safety_critical" },
  emergencyFallback: { family: "I_support", ja: "緊急時の退避先", layer: "L1b", secondaryLayer: "L1", valence: ["role"], missingData: "safety_critical" },
  informationHelp: { family: "I_support", ja: "情報・案内", layer: "L1b", secondaryLayer: "L2b", valence: ["tripIntent"], missingData: "ordinary" },
  reservationEligibility: { family: "I_support", ja: "予約適格性", layer: "L5", secondaryLayer: "L7", valence: ["tripIntent"], missingData: "ordinary" },
  perceivedSafety: { family: "J_safety", ja: "体感安全(昼夜分離)", layer: "L1b", valence: ["relationship", "timeOfDay", "context"], missingData: "safety_critical" },
  crisisRobustness: { family: "J_safety", ja: "災害・緊急頑健性", layer: "L2", valence: ["context", "phase"], missingData: "safety_critical" },
  hygieneCleanliness: { family: "K_condition", ja: "衛生・清潔(worn≠dirty)", layer: "L1b", valence: ["context"], missingData: "ordinary" },
  languageAccessibility: { family: "L_communication", ja: "言語アクセシビリティ", layer: "L1b", valence: ["relationship", "context"], missingData: "ordinary" },
  ritualSocialCompetenceLoad: { family: "L_communication", ja: "作法・対人摩擦負荷", layer: "L2", valence: ["role", "tripIntent"], missingData: "ordinary" },
  digitalConnectivity: { family: "M_infra_work", ja: "通信・接続", layer: "L1b", valence: ["tripIntent", "context"], missingData: "ordinary" },
  workSuitability: { family: "M_infra_work", ja: "就業適性", layer: "L1b", valence: ["tripIntent", "role"], missingData: "ordinary" },
  noveltySeeking: { family: "N_crosscut", ja: "新奇希求(横断trait)", layer: "L1", valence: ["tripIntent", "recoveryStyle", "fatigue"], missingData: "trait_neutral" },
  paceAutonomy: { family: "N_crosscut", ja: "ペース・自律(横断trait)", layer: "L1", valence: ["tripIntent", "relationship", "fatigue"], missingData: "trait_neutral" },
  childFamilyFriendliness: { family: "N_crosscut", ja: "子連れ・家族適性", layer: "L1b", secondaryLayer: "L5r", valence: ["relationship", "context"], missingData: "ordinary" },
  gradedAccessibilityComfort: { family: "N_crosscut", ja: "段階的アクセシビリティ快適", layer: "L2", valence: ["fatigue", "relationship", "context"], missingData: "ordinary" },
};

// ═══ Extension hatch (未来 indicator・型で veto 不可・default 低 confidence) ═══
export interface ExtIndicatorSpec {
  key: string;
  /** 既定低め（0..0.5 想定） */
  defaultConfidence: number;
  /** ★ 型ロック: 拡張 indicator は決して veto 能力を持てない */
  vetoCapable: false;
}
export type ExtIndicatorRegistry = Record<string, ExtIndicatorSpec>;

// ═══ INTERACTION registry (型付き・modifies は既存 component/construct/hardBlock のみ) ═══
export const INTERACTION_SCOPES = ["within_object", "cross_object", "object_context", "object_user", "object_group"] as const;
export type InteractionScope = (typeof INTERACTION_SCOPES)[number];
export const INTERACTION_COMBINERS = ["superadditive", "saturating", "gating", "sign_flip", "veto_escalation", "threshold"] as const;
export type InteractionCombiner = (typeof INTERACTION_COMBINERS)[number];
export const INTERACTION_CONFIDENCE_RULES = ["min_of_inputs", "product_of_inputs"] as const;
export type InteractionConfidenceRule = (typeof INTERACTION_CONFIDENCE_RULES)[number];
export const INTERACTION_MISSING_POLICIES = ["no_fire", "fail_closed", "confidence_reduce"] as const;
export type InteractionMissingPolicy = (typeof INTERACTION_MISSING_POLICIES)[number];

/** ★ 修飾対象は必ず既存の component / construct / hardBlock（新並列スコアを作らない不変条件を型化） */
export type InteractionTarget =
  | { kind: "component"; key: FitComponentKey }
  | { kind: "construct"; axis: ConstructAxis }
  | { kind: "hardBlock" };

export interface InteractionTerm {
  id: string;
  scope: InteractionScope;
  inputs: readonly string[];
  modifies: InteractionTarget;
  combiner: InteractionCombiner;
  confidence: InteractionConfidenceRule;
  missingData: InteractionMissingPolicy;
  hardBlockCapable: boolean;
}

export const INTERACTION_REGISTRY: readonly InteractionTerm[] = [
  { id: "IX_baggage_stairs_crowd", scope: "within_object", inputs: ["baggageLoad", "stairsSlopeLoad", "crowdNoiseVolatility"], modifies: { kind: "component", key: "burdenFit" }, combiner: "superadditive", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_rain_outdoor_fallback", scope: "object_context", inputs: ["weatherTiming", "outdoorExposure", "fallbackRouteAvailability"], modifies: { kind: "hardBlock" }, combiner: "gating", confidence: "min_of_inputs", missingData: "fail_closed", hardBlockCapable: true },
  { id: "IX_earlymorning_terminal_sleepdebt", scope: "object_user", inputs: ["morningBurden", "terminalBurden", "fatigueRisk"], modifies: { kind: "component", key: "burdenFit" }, combiner: "superadditive", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_food_fatigue", scope: "cross_object", inputs: ["portionHeaviness", "nextActivityIntensity", "fatigueRisk"], modifies: { kind: "component", key: "recoveryFit" }, combiner: "threshold", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_queue_hunger_patience", scope: "object_group", inputs: ["queueWaitBurden", "hunger", "groupFairnessPressure"], modifies: { kind: "component", key: "burdenFit" }, combiner: "superadditive", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_quiet_recovery", scope: "object_user", inputs: ["quietness", "recoveryStyle", "tripIntent"], modifies: { kind: "construct", axis: "quietness" }, combiner: "sign_flip", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_crowd_role", scope: "object_group", inputs: ["crowdNoiseVolatility", "relationship", "role"], modifies: { kind: "construct", axis: "crowdNoiseVolatility" }, combiner: "sign_flip", confidence: "min_of_inputs", missingData: "confidence_reduce", hardBlockCapable: false },
  { id: "IX_hoteldrop_order_luggage", scope: "cross_object", inputs: ["luggageDropBurden", "destinationOrderingBurden", "baggageLoad"], modifies: { kind: "component", key: "burdenFit" }, combiner: "gating", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_step_continuity", scope: "within_object", inputs: ["accessibilitySupport", "transferComplexityBurden", "terminalWalkingBurden"], modifies: { kind: "hardBlock" }, combiner: "veto_escalation", confidence: "min_of_inputs", missingData: "fail_closed", hardBlockCapable: true },
  { id: "IX_cancel_weather", scope: "object_context", inputs: ["cancellationFlexibility", "weatherTiming", "irreversibleCommitment"], modifies: { kind: "construct", axis: "cancellationFlexibility" }, combiner: "threshold", confidence: "min_of_inputs", missingData: "confidence_reduce", hardBlockCapable: false },
  { id: "IX_scenic_explore", scope: "object_user", inputs: ["scenicValue", "tripIntent", "durationFit"], modifies: { kind: "construct", axis: "scenicValue" }, combiner: "sign_flip", confidence: "min_of_inputs", missingData: "no_fire", hardBlockCapable: false },
  { id: "IX_work_transport", scope: "object_user", inputs: ["workabilityValue", "tripIntent", "mainLegBurden"], modifies: { kind: "construct", axis: "workabilityValue" }, combiner: "threshold", confidence: "min_of_inputs", missingData: "confidence_reduce", hardBlockCapable: false },
  { id: "IX_deadzone_work", scope: "object_user", inputs: ["digitalConnectivity", "tripIntent"], modifies: { kind: "construct", axis: "digitalConnectivity" }, combiner: "superadditive", confidence: "min_of_inputs", missingData: "confidence_reduce", hardBlockCapable: false },
  { id: "IX_night_safety", scope: "object_group", inputs: ["perceivedSafety", "relationship", "nightSuitability"], modifies: { kind: "construct", axis: "perceivedSafety" }, combiner: "veto_escalation", confidence: "min_of_inputs", missingData: "fail_closed", hardBlockCapable: true },
  { id: "IX_lang_ritual", scope: "within_object", inputs: ["languageAccessibility", "ritualSocialCompetenceLoad"], modifies: { kind: "construct", axis: "ritualSocialCompetenceLoad" }, combiner: "superadditive", confidence: "min_of_inputs", missingData: "confidence_reduce", hardBlockCapable: false },
];

// ═══ DOUBLE-COUNT 禁止規則（§8） ═══
export interface DoubleCountRule { left: string; right: string; rule: string; }
export const DOUBLE_COUNT_RULES: readonly DoubleCountRule[] = [
  { left: "crowd-as-value", right: "crowd-as-burden", rule: "sign_flip で一方に符号確定・両軸同時計上禁止" },
  { left: "priceValue", right: "budgetFit", rule: "対価妥当性(質) vs 予算適合(L6)・別レイヤ別計上" },
  { left: "aestheticRefinement", right: "hygieneCleanliness", rule: "古い(worn)≠汚い(dirty)・surfaceWornVsDirty で分離" },
  { left: "smellAirComfort", right: "hygieneCleanliness", rule: "臭気は衛生の一症状・別 indicator" },
  { left: "perceivedSafety", right: "crisisRobustness", rule: "体感(L1b) ≠ 構造リスク(L2)" },
  { left: "digitalConnectivity", right: "workSuitability", rule: "接続 ≠ 就業適性" },
  { left: "conversationMealFit", right: "workSuitability", rule: "会話の質 ≠ 通話/集中" },
  { left: "gradedAccessibilityComfort", right: "accessibilitySupport", rule: "代償帯(L2) ≠ 絶対 veto(L5)" },
  { left: "noveltySeeking", right: "localnessValue", rule: "trait は符号反転のみ・自身を score に足さない" },
  { left: "interaction", right: "base_component", rule: "相互作用は既存 component の修飾子・新並列スコアを作らない" },
];

// ═══ T11-C3 rollup wiring（construct→fit-core 接続の型/写像・typed registry を崩さない） ═══

/**
 * ★ entity 指標入力（**typed**: per-construct の許可 indicator key のみ受ける・`string` に戻さない）。
 * 供給は optional・非供給時は construct 寄与ゼロ（presence-gated・従来挙動）。
 */
export type ConstructIndicatorInput = {
  [A in ConstructAxis]?: Partial<Record<(typeof INDICATOR_REGISTRY)[A][number], { value: number; confidence: number }>>;
};

/** user 側の construct 選好（visibility=private は full に効くが shared 射影に出ない） */
export interface ConstructPreference {
  value: number;
  confidence: number;
  visibility?: "shared" | "private";
}
export type ConstructPreferenceInput = Partial<Record<ConstructAxis, ConstructPreference>>;

/**
 * C3 第一 slice で配線する construct（registry の実名・全 700 は配線しない）。
 * 概念「mobilityBurden」は registry 分解どおり walkingLoad/stairsSlopeLoad/transferBurden/baggageLoad の
 * 4 burden construct（walking/stairs/transfer/baggage 指標を被覆）。概念「tranquility」= registry の quietness。
 */
export const WIRED_CONSTRUCTS = [
  "quietness",
  "hygieneCleanliness",
  "noveltySeeking",
  "walkingLoad",
  "stairsSlopeLoad",
  "transferBurden",
  "baggageLoad",
  "mealRoleAffinity",
  "arrivalFreshness",
  // C5: route comfort 価値（recoveryFit へ・presence-gated・主に routeInput 派生で供給）
  "workabilityValue",
  "sleepabilityValue",
  // C5.1: ★ door-to-door 総 route 負荷の集約（burdenFit へ・walkingLoad は歩行専用に戻す）
  "routeChainBurden",
] as const;
export type WiredConstruct = (typeof WIRED_CONSTRUCTS)[number];

export interface ConstructWiring {
  /** 修飾する既存 component（新並列スコアを作らない） */
  component: Extract<FitComponentKey, "traitFit" | "burdenFit" | "roleFit" | "recoveryFit">;
  kind: "trait_match" | "burden_penalty" | "role_affinity" | "recovery_value";
  /** entity スコアの供給源: 指標 rollup / 既存 legacy trait 軸 */
  entityScoreFrom: "indicators" | "legacy_trait";
  /** entityScoreFrom=legacy_trait の参照 entity 軸 */
  legacyTraitAxis?: SharedTraitAxis;
  /** 二重計上回避: legacy user-trait loop から除外する軸（supersede） */
  supersedeUserTraitAxes?: readonly SharedTraitAxis[];
  /** 二重計上回避: legacy burdenFit から除外する entity 負荷軸 */
  supersedeBurdenAxes?: readonly EntityBurdenAxis[];
  /** userPref 未供給時の legacy fallback 軸（user.traits[axis]） */
  userPrefFallbackTraitAxis?: SharedTraitAxis;
  /** burden_penalty の user 耐性軸 */
  toleranceAxis?: UserToleranceAxis;
  /** role_affinity の category gate */
  categoryGate?: "food";
  /** valence 多因子（recoveryStyle/tripIntent）で符号/強度が動くか */
  valenceSensitive?: boolean;
}

export const CONSTRUCT_WIRING: Record<WiredConstruct, ConstructWiring> = {
  quietness: { component: "traitFit", kind: "trait_match", entityScoreFrom: "indicators", supersedeUserTraitAxes: ["quietLively"], userPrefFallbackTraitAxis: "quietLively", valenceSensitive: true },
  hygieneCleanliness: { component: "traitFit", kind: "trait_match", entityScoreFrom: "indicators" },
  noveltySeeking: { component: "traitFit", kind: "trait_match", entityScoreFrom: "legacy_trait", legacyTraitAxis: "noveltyFamiliar", supersedeUserTraitAxes: ["noveltyFamiliar"], userPrefFallbackTraitAxis: "noveltyFamiliar" },
  walkingLoad: { component: "burdenFit", kind: "burden_penalty", entityScoreFrom: "indicators", supersedeBurdenAxes: ["travelBurden"], toleranceAxis: "mobilityTolerance" },
  stairsSlopeLoad: { component: "burdenFit", kind: "burden_penalty", entityScoreFrom: "indicators", supersedeBurdenAxes: ["physicalLoad"], toleranceAxis: "stairSlopeTolerance" },
  transferBurden: { component: "burdenFit", kind: "burden_penalty", entityScoreFrom: "indicators", supersedeBurdenAxes: ["travelBurden"], toleranceAxis: "mobilityTolerance" },
  baggageLoad: { component: "burdenFit", kind: "burden_penalty", entityScoreFrom: "indicators", supersedeBurdenAxes: ["baggageBurden"], toleranceAxis: "mobilityTolerance" },
  mealRoleAffinity: { component: "roleFit", kind: "role_affinity", entityScoreFrom: "indicators", categoryGate: "food" },
  arrivalFreshness: { component: "recoveryFit", kind: "recovery_value", entityScoreFrom: "indicators" },
  workabilityValue: { component: "recoveryFit", kind: "recovery_value", entityScoreFrom: "indicators" },
  sleepabilityValue: { component: "recoveryFit", kind: "recovery_value", entityScoreFrom: "indicators" },
  // C5.1: route 総負荷 → burdenFit（travelBurden を supersede・walkingLoad とは別軸=歩行と総負荷の混同を排す）
  routeChainBurden: { component: "burdenFit", kind: "burden_penalty", entityScoreFrom: "indicators", supersedeBurdenAxes: ["travelBurden"], toleranceAxis: "mobilityTolerance" },
};

/** 指標→construct rollup の重み（非 opaque・未列挙=等重み） */
export const ROLLUP_WEIGHTS: Partial<Record<WiredConstruct, Partial<Record<string, number>>>> = {
  quietness: { nightQuietness: 1.3, ambientNoiseFloorDb: 1.2 },
  walkingLoad: { walkingDistanceKm: 1.3, egressWalkShare: 1.2 },
};

/** tripIntent による rollup 重み上書き（A3 §6・第一 slice は最小） */
export const CONTEXT_ROLLUP_OVERRIDE: Partial<Record<"recovery" | "exploration" | "social" | "work" | "romance", Partial<Record<WiredConstruct, Partial<Record<string, number>>>>>> = {
  work: { quietness: { nightQuietness: 1.6 } },
};

