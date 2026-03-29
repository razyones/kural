/**
 * The compass rose. Configures the static reference sentences that anchor
 * semantic measurement axes. It is the only module that declares what
 * conceptual dimensions the system can measure — no other module owns
 * axis anchor data.
 */

/** A semantic axis defined by two groups of anchor sentences at opposite poles. */
type AxisDefinition = {
  /** Machine-readable axis identifier */
  id: string;
  /** Sentences representing the negative pole */
  negativeAnchors: string[];
  /** Sentences representing the positive pole */
  positiveAnchors: string[];
};

/**
 * The "is ↔ does" axis.
 * Negative pole: identity, category, nature ("what is this?").
 * Positive pole: function, behavior, action ("what does this do?").
 * Multilingual anchors reduce surface-form bias.
 */
const IS_DOES_AXIS: AxisDefinition = {
  id: "is-does",
  negativeAnchors: [
    "What is this thing?",
    "What kind of entity is this?",
    "What category does this belong to?",
    "What does this represent?",
    "What type of concept is this?",
    "What is the nature of this?",
    "How would you classify this?",
    "What is this an instance of?",
    "What domain does this belong to?",
    "What is the identity of this?",
    "¿Qué tipo de cosa es esto?",
    "これは何を表していますか？",
    "Qu'est-ce que c'est exactement ?",
    "이것은 어떤 종류의 것인가요?",
    "Was für ein Ding ist das?",
    "Это что за сущность?",
    "இது எந்த வகையைச் சேர்ந்தது?",
    "Isso é uma instância de quê?",
    "这属于什么类别？",
    "यह किस प्रकार की चीज़ है?",
  ],
  positiveAnchors: [
    "What does this do?",
    "What action does this perform?",
    "What is the behavior of this?",
    "What operation does this carry out?",
    "What purpose does this serve?",
    "What task does this accomplish?",
    "What effect does this produce?",
    "How does this act on its inputs?",
    "What work does this execute?",
    "What function does this fulfill?",
    "¿Qué acción realiza esto?",
    "これはどんな動作をしますか？",
    "Quelle opération cela effectue-t-il ?",
    "이것은 어떤 작업을 수행하나요?",
    "Welche Aufgabe führt das aus?",
    "Какое действие это выполняет?",
    "இது என்ன செயலைச் செய்கிறது?",
    "Que função isso executa?",
    "这会产生什么效果？",
    "यह क्या काम करता है?",
  ],
};

const AXES: AxisDefinition[] = [IS_DOES_AXIS];

export { AXES, IS_DOES_AXIS };
export type { AxisDefinition };
