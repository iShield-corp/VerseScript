import path from 'path';

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'verseScript.min.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'Verse',
    libraryTarget: 'umd',
    sourceMapFilename: '[file].map',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
    ],
  },
};