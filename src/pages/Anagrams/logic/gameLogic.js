// src/pages/Anagrams/logic/gameLogic.js


export class AnagramsGame {
  constructor(players, wordList) {

    //  this.players will hold
    //  {Alice: { words: [], score: 0 },
    //   Bob: { words: [], score: 0 },
    //   Charlie: { words: [], score: 0 }}
    //  where words is of type WordInfo
    this.players = players.reduce((acc, name) => {
      acc[name] = { words: [], score: 0 };
      return acc;
    }, {});
    this.dictionary = new Set(wordList);
    this.lettersPool = this.shuffle(this.generateTiles());
    this.visibleLetters = [];
  }

  generateTiles() {
    const tileDistribution = {
        A: 13, B: 3, C: 3, D: 6, E: 18, F: 3, G: 4, H: 3, I: 12,
        J: 2, K: 2, L: 5, M: 3, N: 8, O: 11, P: 3, Q: 2, R: 9,
        S: 6, T: 9, U: 6, V: 3, W: 3, X: 2, Y: 3, Z: 2
    };
    const letters = Object.entries(tileDistribution).flatMap(([letter, count]) =>
        Array(count).fill(letter)
    );
    return letters;
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  revealLetter() {
    if (this.lettersPool.length > 0) {
      const letter = this.lettersPool.pop();
      this.visibleLetters.push(letter);
      return letter;
    }
    return null;
  }

  isValidWord(word) {
    return this.dictionary.has(word.toLowerCase());
  }

  findBaseWord(baseWord) {
    // by default, chooses the word that requires the least letters to be added
    // ex: Alice has 'rat' and Bob has 'star' and someone tries to steal 'start'
    //     we go for Bob's word
    // nahhhhhh, we gonna give you the option so that you can choose who you fuck over
    //
    const possibleSteals = [];
    this.players.forEach(player => {
        player.words.forEach(word => {
          // TODO
        })
        
        possibleSteals.push()
    });



    return {
        baseWords: 'apple',
        fromPlayers: ['Alice'],
    }
  }

  canSteal(baseWord, newWord) {
    // logic TBD
    return newWord.indexOf(baseWord) == 0;
  }

  stealWord(baseWord, newWord, stealer) {
    // TODO

  }
}

// This is an object that holds a word as well as the count of each letter
// Ex: WordInfo('apple') is the object { word = 'apple', count = {'A' : 1, 'E': 1, 'L': 1, 'P': 2}}
class WordInfo {
    constructor(word) {
        this.word = word
        var count = {}
        this.word.toUpperCase().forEach(letter => {
            if(letter in count) {
                count[letter] += 1
            } else {
                count[letter] = 1
            }
        })
        this.count = count
    }

    containsOldWord(newWord) {
      this.count.forEach(obj => {
        // TODO

      })
    }

    isPrefixOf(newWord) {
      // TODO
    }

}