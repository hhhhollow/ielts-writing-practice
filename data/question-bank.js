(() => {
  const questionSets = [
  {
    "id": "C18T1",
    "task1": {
      "category": "动态折线图（Line Graph）",
      "text": "You should spend about 20 minutes on this task.\n\nThe graph below gives information about the percentage of the population in four Asian countries living in cities from 1970 to 2020, with predictions for 2030 and 2040.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c18t1.png"
    },
    "task2": {
      "category": "同意与否类（Agree / Disagree）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nThe most important aim of science should be to improve people's lives.\n\nTo what extent do you agree or disagree with this statement?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C18T2",
    "task1": {
      "category": "动态柱状图（Bar Chart）",
      "text": "You should spend about 20 minutes on this task.\n\nThe chart below shows the number of households in the US by their annual income in 2007, 2011 and 2015.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c18t2.png"
    },
    "task2": {
      "category": "双边讨论类（Discuss Both Views）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome university students want to learn about other subjects in addition to their main subjects. Others believe it is more important to give all their time and attention to studying for a qualification.\n\nDiscuss both these views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C18T3",
    "task1": {
      "category": "变迁地图题（Maps）",
      "text": "You should spend about 20 minutes on this task.\n\nThe diagram below shows the floor plan of a public library 20 years ago and how it looks now.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c18t3.png"
    },
    "task2": {
      "category": "现象评价/利弊类（Positive or Negative Development）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries around the world, rural people are moving to cities, so the population in the countryside is decreasing.\n\nDo you think this is a positive or a negative development?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C18T4",
    "task1": {
      "category": "动态折线图（Line Graph）",
      "text": "You should spend about 20 minutes on this task.\n\nThe graph below shows the average monthly change in the prices of three metals during 2014.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c18t4.png"
    },
    "task2": {
      "category": "利弊比较类（Advantages vs Disadvantages）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries, people are now living longer than ever before. Some people say an ageing population creates problems for governments. Other people think there are benefits if society has more elderly people.\n\nTo what extent do the advantages of having an ageing population outweigh the disadvantages?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C19T1",
    "task1": {
      "category": "动态折线图（Line Graph）",
      "text": "You should spend about 20 minutes on this task.\n\nThe graph below gives information on the numbers of participants for different activities at one social centre in Melbourne, Australia for the period 2000 to 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c19t1.png"
    },
    "task2": {
      "category": "双边讨论类（Discuss Both Views）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome people think that competition at work, at school and in daily life is a good thing. Others believe that we should try to cooperate more, rather than competing against each other.\n\nDiscuss both these views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C19T2",
    "task1": {
      "category": "变迁地图题（Maps）",
      "text": "You should spend about 20 minutes on this task.\n\nThe plans below show a harbour in 2000 and how it looks today.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c19t2.png"
    },
    "task2": {
      "category": "同意与否类（Agree / Disagree）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nThe working week should be shorter and workers should have a longer weekend.\n\nDo you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C19T3",
    "task1": {
      "category": "工业生产流程图（Flowchart / Process）",
      "text": "You should spend about 20 minutes on this task.\n\nThe diagram below shows how a biofuel called ethanol is produced.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c19t3.png"
    },
    "task2": {
      "category": "同意与否类（Agree / Disagree）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIt is important for everyone, including young people, to save money for their future.\n\nTo what extent do you agree or disagree with this statement?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C19T4",
    "task1": {
      "category": "混合图（Pie Chart & Bar Chart）",
      "text": "You should spend about 20 minutes on this task.\n\nThe charts below give information on the location and types of dance classes young people in a town in Australia are currently attending.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c19t4.png"
    },
    "task2": {
      "category": "现象评价/利弊类（Positive or Negative Development）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries nowadays, consumers can go to a supermarket and buy food produced all over the world.\n\nDo you think this is a positive or negative development?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C20T1",
    "task1": {
      "category": "静态表格题（Tables）",
      "text": "You should spend about 20 minutes on this task.\n\nThe first table below shows changes in the total population of New York City from 1800 to 2000. The second and third tables show changes in the population of the five districts of the city (Manhattan, Brooklyn, Bronx, Queens, Staten Island) over the same period.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c20t1.png"
    },
    "task2": {
      "category": "同意与否类（Agree / Disagree）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nAccess to clean water is a basic human right. Therefore every home should have a water supply that is provided free of charge.\n\nDo you agree or disagree?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C20T2",
    "task1": {
      "category": "变迁地图题（Maps）",
      "text": "You should spend about 20 minutes on this task.\n\nThe plans below show the site of a farm in 1950 and the same site today.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c20t2.png"
    },
    "task2": {
      "category": "双问题 / 混合提问（Two Questions）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nIn many countries, primary and secondary schools close for two months or more in the summer holidays.\n\nWhat is the value of long school holidays?\nWhat are the arguments in favour of shorter school holidays?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C20T3",
    "task1": {
      "category": "混合图（Bar Chart & Line Graph & Table）",
      "text": "You should spend about 20 minutes on this task.\n\nThe charts below give information about a public library in a town called Little Chalfont.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c20t3.png"
    },
    "task2": {
      "category": "利弊比较类（Advantages vs Disadvantages）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome people have decided to reduce the number of times they fly every year or to stop flying altogether.\n\nDo you think the environmental benefits of this development outweigh the disadvantages for individuals and businesses?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C20T4",
    "task1": {
      "category": "制作/生产流程图（Process Diagram）",
      "text": "You should spend about 20 minutes on this task.\n\nThe diagram below shows how fabric is manufactured from bamboo.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c20t4.png"
    },
    "task2": {
      "category": "双问题 / 原因+现象评价（Two Questions）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nMany aspects of the way people dress today are influenced by global fashion trends.\n\nHow has global fashion become such a strong influence on people's lives?\nDo you think this is a positive or negative development?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C21T1",
    "task1": {
      "category": "动态折线图（Line Graph）",
      "text": "You should spend about 20 minutes on this task.\n\nThe graph below gives information about the number of jobs in four sectors of the economy in the US between 1960 and 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c21t1.png"
    },
    "task2": {
      "category": "同意与否类（Agree / Disagree）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nThe best way to provide enough homes in large cities is to build tall apartment blocks.\n\nTo what extent do you agree or disagree with this statement?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C21T2",
    "task1": {
      "category": "变迁地图题（Maps）",
      "text": "You should spend about 20 minutes on this task.\n\nThe plans below show a college cafe before it was redesigned and how it looks now.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c21t2.png"
    },
    "task2": {
      "category": "双边讨论类（Discuss Both Views）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome people say that in the digital age, theatres and cinemas are no longer important as people can watch all the entertainment they want online. Others argue that theatres and cinemas are still important both economically and culturally.\n\nDiscuss both these views and give your own opinion.\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C21T3",
    "task1": {
      "category": "自然形成原理图（Natural Diagram）",
      "text": "You should spend about 20 minutes on this task.\n\nThe diagram below shows how one type of desert, known as a rain-shadow desert, is formed.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c21t3.png"
    },
    "task2": {
      "category": "利弊比较类（Advantages vs Disadvantages）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nAll university undergraduate courses should include a period of time spent studying abroad or doing a work placement.\n\nDo you think the advantages of this would outweigh the disadvantages?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  },
  {
    "id": "C21T4",
    "task1": {
      "category": "组合图（Bar Chart & Table）",
      "text": "You should spend about 20 minutes on this task.\n\nThe chart and table below show the results of a survey of library users at a university.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.\n\nWrite at least 150 words.",
      "image": "assets/questions/c21t4.png"
    },
    "task2": {
      "category": "双问题 / 组合提问（Two Questions）",
      "text": "You should spend about 40 minutes on this task.\n\nWrite about the following topic:\n\nSome people argue that primary schools focus too much on formal learning.\n\nTo what extent do you agree with this opinion?\nHow important do you think it is for children to play as well as learn in the primary school classroom?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.\n\nWrite at least 250 words."
    }
  }
];
  window.IELTS_QUESTION_BANK = Object.freeze({ questionSets });
})();
