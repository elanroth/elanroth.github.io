export type StrumBeat = [
  stroke: "D" | "U" | "PM" | "–" | "—" | "?",
  effect: "" | "mute" | "accent" | "rest",
];

export type StrummingPattern = {
  part: string;
  bpm: number;
  denominator: number;
  triplet: boolean;
  beats: StrumBeat[];
};

export type ImportedPracticeData = {
  wordHashes: string[];
  chordAnchors: Array<[wordIndex: number, chord: string]>;
  sections: Array<[wordIndex: number, section: string]>;
  strumming: StrummingPattern[];
};

// Generated from public saved-tab payloads. Lyric text is deliberately not
// stored: one-way word hashes align chord changes to LRCLIB at runtime.
// Good Riddance is retained as a verified seed while the full import runs.
export const IMPORTED_PRACTICE_DATA: Record<string, ImportedPracticeData> = {
  "1838945": {
    wordHashes: ["1thtbr8","k22fus","1wzefya","qyxx3k","1r9wi7g","19jrvtl","1thtbr8","k22fus","1y338zh","47gkh2","1thtbr8","k22fus","6vu8qv","1thtbr8","k22fus","r9z5b7","h4k3yt","15kc5th","17d2grv","1r9wi7g","1de3cvt","17uvg9d","1qldj8i","px1mt1","qv8tqk","1thtbr8","1gp93yy","1ftn48f","tz8pns","zd8bh5","1thtbr8","t9acby","1oj91fl","18hsyp","i3gxwe","8sh37b","6dplb2","1dyjk0s","1n9htyi","h4k3yt","47gkh2","14bbmnu","inuyw0","1dyjk0s","qpbw83","1uptt2d","1thtbr8","nbjo0n","1r9wi7g","juq0qp","1uptt2d","1thtbr8","nbjo0n","i2piau","g8mj2c","1t8qrm2","3ax5bq","1dyjk0s","1ftn48f","xd570w","5opvf0","1ycr8my","pmp2tr","zd8bh5","1thtbr8","1i1rk9v","1dyjk0s","152avbw","qoa1b0","1thtbr8","1gp93yy","l4xqxf","1syst26","1ls5re8","1ib8dma","2kz9j8","z9xzhl","1dlggvm","1ar2jsa","1thtbr8","1i7favm","1kcnkfg","1w9pcoy","l4xqxf","dk8tlu","zd8bh5","1mqvzct","1uu0z2j","1dyjk0s","a8yqc1","47gkh2","15nrc2a","y0hy38","1dyjk0s","sx9r10","jrek28","w5vkbw","l4xqxf","1t01pu7","1t01pu7","42hbdv","15hcb3k","67p61j","1rkd8gq","1r9wi7g","1wmriaz","t6uqnc","13l2nyx","zd8bh5","1oj91fl","12c2w59","ffrwk3","w5vkbw","4w1av4","47gkh2","1thtbr8","vvv65p","idyip0","1gp93yy","l4xqxf","17viebq","1thtbr8","13pus0v","1u64y88","1dyjk0s","1v73319","2c1yia","1ccjf04","1w6691o","1fsywjz","l4xqxf","blr15m","18ntnxq","nk7brv","1uptt2d","1thtbr8","nbjo0n","1r9wi7g","juq0qp","1uptt2d","1thtbr8","nbjo0n","i2piau","g8mj2c","1t8qrm2","3ax5bq","1dyjk0s","1ftn48f","xd570w","5opvf0","1ycr8my","pmp2tr","zd8bh5","1thtbr8","1i1rk9v","1dyjk0s","152avbw","qoa1b0","1thtbr8","1gp93yy","l4xqxf","1syst26","1ls5re8","1ib8dma","2kz9j8","z9xzhl","1dlggvm","1ar2jsa","1thtbr8","1i7favm","1kcnkfg","1w9pcoy","l4xqxf","dk8tlu","1uptt2d","1thtbr8","nbjo0n","1r9wi7g","juq0qp","1uptt2d","1thtbr8","nbjo0n","i2piau","g8mj2c","1t8qrm2","3ax5bq","1dyjk0s","1ftn48f","xd570w","5opvf0","1ycr8my","pmp2tr","zd8bh5","1thtbr8","1i1rk9v","1dyjk0s","152avbw","qoa1b0","1thtbr8","1gp93yy","l4xqxf","1syst26","1ls5re8","1ib8dma","2kz9j8","z9xzhl","1dlggvm","1ar2jsa","1thtbr8","1i7favm","1kcnkfg","1w9pcoy","l4xqxf","dk8tlu","1ar2jsa","1thtbr8","1i7favm","1kcnkfg","1w9pcoy","l4xqxf","dk8tlu","1ar2jsa","1thtbr8","1i7favm","1kcnkfg","1w9pcoy","l4xqxf","dk8tlu"],
    chordAnchors: [[0,"G"],[8,"C"],[12,"G"],[13,"G"],[19,"D"],[24,"G"],[29,"C"],[35,"Em"],[38,"G"],[41,"D"],[44,"C"],[44,"G"],[49,"G"],[50,"C"],[54,"G"],[58,"G"],[63,"D"],[69,"G"],[74,"C"],[77,"Em"],[78,"C"],[80,"G"],[83,"D"],[84,"G"],[86,"G"],[90,"C"],[94,"G"],[95,"G"],[102,"D"],[110,"G"],[116,"C"],[120,"Em"],[123,"G"],[127,"D"],[129,"C"],[133,"G"],[138,"G"],[139,"C"],[143,"G"],[147,"G"],[152,"D"],[158,"G"],[163,"C"],[166,"Em"],[167,"C"],[169,"G"],[172,"D"],[173,"G"],[178,"G"],[179,"C"],[183,"G"],[187,"G"],[192,"D"],[198,"G"],[203,"C"],[206,"Em"],[207,"C"],[209,"G"],[212,"D"],[213,"Em"],[214,"C"],[216,"G"],[219,"D"],[220,"Em"],[221,"C"],[223,"G"],[226,"D"],[227,"G"]],
    sections: [[0,"Verse 1"],[45,"Chorus"],[85,"Verse 2"],[134,"Chorus"],[174,"Chorus"]],
    strumming: [],
  },
  "31443": {
    wordHashes: [],
    chordAnchors: [],
    sections: [],
    strumming: [{
      part: "All",
      bpm: 96,
      denominator: 16,
      triplet: false,
      beats: [
        ["D", "accent"], ["–", "rest"], ["D", ""], ["U", ""],
        ["–", "rest"], ["U", ""], ["D", ""], ["U", ""],
        ["D", "accent"], ["–", "rest"], ["D", ""], ["U", ""],
        ["–", "rest"], ["U", ""], ["D", ""], ["U", ""],
      ],
    }],
  },
};
