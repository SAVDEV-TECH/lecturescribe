export const initialSeedNote = {
  id: 'seed-lecture-ai-101',
  title: 'Intro to AI & Neural Networks',
  tag: 'Computer Science',
  timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  transcript: `Welcome to CS 301 on modern AI and Machine Learning. Early AI used symbolic rules and Alan Turing's 1950 Turing Test, which checks whether machine text conversation is indistinguishable from a human.

Machine Learning shifts from fixed rules to learning patterns from data. Neural Networks stack input, hidden, and output layers with non-linear activations, tuning weights via backpropagation and gradient descent to minimize error.`,
  notes: {
    summary: 'Covers Turing’s 1950 test, data-driven machine learning, and neural networks trained via backpropagation.',
    keyConcepts: [
      {
        term: 'Turing Test',
        definition: 'Checks if a machine’s text replies are indistinguishable from a human’s.'
      },
      {
        term: 'Machine Learning',
        definition: 'Algorithms that learn patterns from data instead of fixed rules.'
      },
      {
        term: 'Neural Network',
        definition: 'Layered nodes computing weighted sums via non-linear activations.'
      },
      {
        term: 'Backpropagation',
        definition: 'Computes weight gradients so gradient descent reduces error.'
      }
    ],
    outline: [
      'Alan Turing (1950) & Turing Test',
      'Symbolic rules vs. machine learning',
      'Neural layers: input, hidden, output',
      'Backpropagation & gradient descent'
    ],
    quizQuestions: [
      {
        question: 'What passes the Turing Test?',
        answer: 'A human judge cannot tell the machine apart via text.',
        options: [
          'Running faster floating-point math than supercomputers.',
          'A human judge cannot tell the machine apart via text.',
          'Using only hand-coded symbolic rules.',
          'Replicating biological neurons in hardware.'
        ],
        correctIndex: 1
      },
      {
        question: 'What does backpropagation do?',
        answer: 'It calculates weight gradients so gradient descent lowers error.',
        options: [
          'It calculates weight gradients so gradient descent lowers error.',
          'It deletes hidden layers at random.',
          'It turns transcripts into audio.',
          'It skips activation functions.'
        ],
        correctIndex: 0
      },
      {
        question: 'How does Machine Learning differ from symbolic AI?',
        answer: 'It learns patterns from data instead of manual rules.',
        options: [
          'Symbolic AI needs GPUs while Machine Learning uses paper.',
          'It learns patterns from data instead of manual rules.',
          'Machine Learning cannot use layers.',
          'There is no difference.'
        ],
        correctIndex: 1
      }
    ]
  }
};
