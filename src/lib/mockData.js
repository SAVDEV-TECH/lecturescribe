export const initialSeedNote = {
  id: 'seed-lecture-ai-101',
  title: 'Intro to Artificial Intelligence & Neural Networks',
  tag: 'Computer Science',
  timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  transcript: `Welcome everyone to Computer Science 301. Today we begin our deep dive into modern Artificial Intelligence and Machine Learning. 

Historically, AI began with symbolic reasoning and the Turing Test proposed by Alan Turing in 1950. The Turing Test posits that if a human interrogator cannot reliably tell a machine from a human through text conversation, the machine exhibits intelligent behavior.

In modern times, we shifted from hand-crafted heuristic rules to Machine Learning. Machine Learning algorithms extract patterns directly from large datasets. Deep Learning takes this further through Artificial Neural Networks, loosely inspired by the biological architecture of human neurons. A neural network consists of an input layer, one or more hidden layers with non-linear activation functions, and an output layer.

During training, the network adjusts its internal weights and biases using backpropagation and gradient descent to minimize a loss function. Next class, we will examine convolutional networks for computer vision and transformers for natural language processing.`,
  notes: {
    summary: 'An introductory survey of Artificial Intelligence tracing the evolution from Alan Turing\'s 1950 behavioral test to statistical Machine Learning and multi-layer Artificial Neural Networks trained via backpropagation and gradient descent.',
    keyConcepts: [
      {
        term: 'Turing Test',
        definition: 'A benchmark test formulated by Alan Turing in 1950 testing whether an AI system can exhibit conversational behavior indistinguishable from a human.'
      },
      {
        term: 'Machine Learning',
        definition: 'A computational paradigm where algorithms learn models directly from data patterns rather than explicit programmed instructions.'
      },
      {
        term: 'Neural Network',
        definition: 'A computational model structured with interconnected layers of artificial nodes that compute weighted sums through non-linear activation functions.'
      },
      {
        term: 'Backpropagation',
        definition: 'The fundamental algorithm used to calculate loss function gradients with respect to each network weight, enabling model optimization.'
      }
    ],
    outline: [
      'Historical foundation: Alan Turing (1950) & the Turing Test',
      'Evolution from symbolic rules to statistical Machine Learning',
      'Architecture of Artificial Neural Networks: input, hidden, and output layers',
      'Training mechanics: Loss functions, gradient descent, and backpropagation',
      'Preview of next lecture: Convolutional Networks and Transformers'
    ],
    quizQuestions: [
      {
        question: 'What is the primary condition required to pass the classical Turing Test?',
        answer: 'A human interrogator communicating only via text cannot reliably determine whether the responder is a machine or a human.'
      },
      {
        question: 'How does backpropagation facilitate neural network training?',
        answer: 'It calculates the mathematical gradient of the loss function with respect to weights, allowing gradient descent to iteratively minimize errors.'
      }
    ]
  }
};
