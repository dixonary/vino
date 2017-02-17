" Vim syntax file
" Language:        vino (Visual Novel Engine) story
" Author:          dixonary
" Latest Revision: 2017-02-11

if exists('b:current_syntax')
    finish
endif

syn include @JS syntax/javascript.vim

syn case ignore

syn region op start=/\v^\s*\[/ end=/\v\]/                   contains=opword,param

syn keyword opword wait pause enter exit stance             contained
syn keyword opword expression move scene textbox            contained
syn keyword opword music sound                              contained
syn match param /\v[a-zA-Z0-9_]+/

syn match speechName /\v^\s*[^:]*\s*:/                         contained
syn match speech     /\v^\s*[^:]*\s*:.*$/                   contains=speechName

syn region js start=/\v`/ end=/\v`/                         contains=jsBookend,@JS keepend
syn match jsBookend /\v\`/                                  contained

syn match goto       /\v\s*\-\>\s*[a-z0-9]+\s*$/
syn match lbl        /\v\s*\:\:\s*[a-z0-9]+\s*$/
syn match option     /\v^\s*\?\s*.+\s*\-\>\s*[a-z0-9]+\s*\&?\s*$/ contains=continue

syn match continue /\v\&\s*$/

syn match Comment    /\v#.*$/


hi! def link op Special
hi! def link opword Statement
hi! def link param Constant

hi! def link goto Type
hi! def link option Type
hi! def link lbl Type
hi! def link js Ignore
hi! def link jsBookend Special
hi! def link continue Special
hi! def link speechName Todo

let b:current_syntax = 'vino'
